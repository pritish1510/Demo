"""OCR: image preprocessing + Tesseract word-level output (text, confidence, bounding box)."""
from __future__ import annotations

import io
import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageEnhance, ImageOps

# Passes run as parallel tesseract processes; stop each one also starting a thread per core.
os.environ.setdefault("OMP_THREAD_LIMIT", "1")

LANG = os.environ.get("OCR_LANG", "eng")
# Small print needs roughly 20-30 px letters; upscale images so the long side is about this size.
TARGET_LONG_SIDE = int(os.environ.get("OCR_TARGET_LONG_SIDE", "3000"))

# (image variant, tesseract config). psm 3 keeps paragraphs together (multi-line addresses);
# psm 11 finds text in the table-like layouts of labels that psm 3 merges or drops.
PASSES = [
    ("gray", "--oem 3 --psm 3"),
    ("gray", "--oem 3 --psm 11"),
    ("threshold", "--oem 3 --psm 11"),
]


def _configure_tesseract() -> None:
    cmd = os.environ.get("TESSERACT_CMD")
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    elif not shutil.which("tesseract"):
        windows_default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(windows_default):
            pytesseract.pytesseract.tesseract_cmd = windows_default


_configure_tesseract()


@dataclass
class Word:
    text: str
    confidence: float  # 0-100, -1 when tesseract gives none
    left: int
    top: int
    width: int
    height: int

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height


@dataclass
class Line:
    words: list[Word]

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    @property
    def box(self) -> tuple[int, int, int, int]:
        return (min(w.left for w in self.words), min(w.top for w in self.words),
                max(w.right for w in self.words), max(w.bottom for w in self.words))


@dataclass
class Paragraph:
    lines: list[Line]


@dataclass
class Page:
    """One OCR pass over one image. Boxes are in pixels of the uploaded image."""
    image: int
    paragraphs: list[Paragraph] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(line.text for p in self.paragraphs for line in p.lines)


@dataclass
class ImageScan:
    passes: list[Page]  # one per entry in PASSES
    width: int | None = None
    height: int | None = None
    error: str | None = None


_version: str | None = None


def tesseract_version() -> str | None:
    """Installed Tesseract version, or None. Re-checked while missing, so installing needs no restart."""
    global _version
    if _version is None:
        try:
            _version = str(pytesseract.get_tesseract_version())
        except (pytesseract.TesseractNotFoundError, OSError):
            return None
    return _version


def scan(data: bytes, image_index: int) -> ImageScan:
    """Run every OCR pass over one uploaded image."""
    try:
        variants, (width, height), scale = _prepare(data)
    except Exception as exc:  # not an image Pillow can decode
        return ImageScan([Page(image_index) for _ in PASSES], error=f"Could not read image: {exc}")
    with ThreadPoolExecutor(max_workers=len(PASSES)) as pool:
        pages = list(pool.map(lambda p: _read(variants[p[0]], p[1], scale, image_index), PASSES))
    return ImageScan(pages, width, height)


def _prepare(data: bytes):
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGB")  # match what the browser displays
    width, height = image.size

    scale = min(3.0, max(1.0, TARGET_LONG_SIDE / max(width, height)))
    if scale > 1:
        image = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)

    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(2.0)
    gray = ImageEnhance.Sharpness(gray).enhance(2.0)
    threshold = Image.fromarray(cv2.adaptiveThreshold(
        np.array(gray), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11))

    return {"gray": gray, "threshold": threshold}, (width, height), scale


def _read(image: Image.Image, config: str, scale: float, image_index: int) -> Page:
    try:
        data = pytesseract.image_to_data(image, lang=LANG, config=config, output_type=pytesseract.Output.DICT)
    except pytesseract.TesseractError:
        return Page(image_index)

    # (page, block, paragraph) → line number → words, both in reading order.
    paragraphs: dict[tuple, dict[int, list[Word]]] = {}
    for i, text in enumerate(data["text"]):
        text = str(text).strip()
        if data["level"][i] != 5 or not text:
            continue
        word = Word(
            text=text,
            confidence=float(data["conf"][i]),
            left=round(data["left"][i] / scale),
            top=round(data["top"][i] / scale),
            width=round(data["width"][i] / scale),
            height=round(data["height"][i] / scale),
        )
        key = (data["page_num"][i], data["block_num"][i], data["par_num"][i])
        paragraphs.setdefault(key, {}).setdefault(data["line_num"][i], []).append(word)

    return Page(image_index, [Paragraph([Line(words) for words in lines.values()]) for lines in paragraphs.values()])

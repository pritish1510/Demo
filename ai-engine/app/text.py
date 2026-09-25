"""
OCR text of all package images, searchable with regular expressions.

Each paragraph is one searchable segment (lines joined by newline, words by a space), and every
character maps back to the OCR word it came from, so a regex match becomes a bounding box on the
image. `near` and `lines_after` use those boxes to find a value laid out next to its heading, as on
table-like labels ("NET WEIGHT:" with "200 g" underneath).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterator

from .ocr import Line, Page, Word

Box = tuple[int, int, int, int]


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


@dataclass
class Found:
    """A match located on a package image."""
    text: str
    groups: tuple
    image: int
    confidence: float | None  # 0-1, mean of the matched words
    box: Box | None

    def group(self, i: int) -> str | None:
        """Regex group (1-based), whitespace collapsed; None when it did not participate."""
        v = self.raw(i)
        return clean(v) if v is not None else None

    def raw(self, i: int) -> str | None:
        return self.groups[i - 1] if 0 < i <= len(self.groups) else None

    def join(self, other: Found) -> Found:
        """This match plus a related one (a heading and the value beside it). Keeps other's groups."""
        box = _union(self.box, other.box) if other.image == self.image else self.box
        return Found(f"{self.text} {other.text}", other.groups, self.image,
                     _mean([self.confidence, other.confidence]), box)


@dataclass
class _Segment:
    image: int
    text: str
    words: list[Word]
    starts: list[int]

    def locate(self, start: int, end: int, groups: tuple) -> Found:
        hit = [w for w, s in zip(self.words, self.starts) if s < end and s + len(w.text) > start]
        return _from_words(clean(self.text[start:end]), groups, self.image, hit)


class LabelText:
    def __init__(self, pages: list[Page]):
        self._segments: list[_Segment] = []
        self._lines: list[tuple[int, Line]] = []
        for page in pages:
            for paragraph in page.paragraphs:
                text, words, starts = "", [], []
                for line in paragraph.lines:
                    if not line.words:
                        continue
                    self._lines.append((page.image, line))
                    if text:
                        text += "\n"
                    for i, w in enumerate(line.words):
                        if i:
                            text += " "
                        starts.append(len(text))
                        words.append(w)
                        text += w.text
                if words:
                    self._segments.append(_Segment(page.image, text, words, starts))

    @property
    def empty(self) -> bool:
        return not self._segments

    def find(self, pattern: re.Pattern, accept: Callable[[Found], bool] | None = None,
             whole_line: bool = False) -> Found | None:
        """First match in reading order (optionally widened to its whole line) that `accept` allows."""
        for s in self._segments:
            for m in pattern.finditer(s.text):
                start, end = m.start(), m.end()
                if whole_line:
                    start = s.text.rfind("\n", 0, start) + 1
                    nl = s.text.find("\n", end)
                    end = len(s.text) if nl < 0 else nl
                f = s.locate(start, end, m.groups())
                if accept is None or accept(f):
                    return f
        return None

    def contains(self, pattern: re.Pattern) -> bool:
        return any(pattern.search(s.text) for s in self._segments)

    def matches(self, pattern: re.Pattern, image: int | None = None) -> Iterator[Found]:
        for s in self._segments:
            if image is None or s.image == image:
                for m in pattern.finditer(s.text):
                    yield s.locate(m.start(), m.end(), m.groups())

    def near(self, anchor: Found, pattern: re.Pattern, accept: Callable[[Found], bool] | None = None,
             max_lines_below: float = 4, max_heights_right: float = 14) -> Found | None:
        """Closest match to the right of `anchor` on the same line, or in the lines just below it."""
        if anchor.box is None:
            return None
        ax1, ay1, ax2, ay2 = anchor.box
        h = max(ay2 - ay1, 1)
        best: tuple[float, Found] | None = None
        for f in self.matches(pattern, anchor.image):
            if f.box is None or (accept and not accept(f)):
                continue
            cx1, cy1, cx2, cy2 = f.box
            if cx1 < ax2 and cx2 > ax1 and cy1 < ay2 and cy2 > ay1:
                continue  # overlaps the heading itself
            overlap = min(ay2, cy2) - max(ay1, cy1)
            if overlap > 0.5 * min(h, cy2 - cy1) and ax2 - h <= cx1 <= ax2 + max_heights_right * h:
                score = cx1 - ax2
            elif ay1 + 0.5 * h <= cy1 <= ay2 + max_lines_below * h and cx1 <= ax2 + 2 * h and cx2 >= ax1 - 2 * h:
                score = (cy1 - ay2) * 1.5 + abs(cx1 - ax1) * 0.3
            else:
                continue
            if best is None or score < best[0]:
                best = (score, f)
        return best[1] if best else None

    def lines_after(self, anchor: Found, count: int = 3) -> Found | None:
        """Up to `count` consecutive lines directly under `anchor`, left-aligned with it (e.g. an address)."""
        if anchor.box is None:
            return None
        ax1, ay1, ax2, ay2 = anchor.box
        h = max(ay2 - ay1, 1)
        below = sorted(
            (line for image, line in self._lines
             if image == anchor.image and line.box[1] >= ay2 - 0.3 * h and abs(line.box[0] - ax1) <= 3 * h),
            key=lambda line: line.box[1])
        taken: list[Line] = []
        bottom = ay2
        for line in below:
            if line.box[1] - bottom > 1.8 * h:
                break
            if any(line.text == t.text for t in taken):
                continue
            taken.append(line)
            bottom = line.box[3]
            if len(taken) == count:
                break
        if not taken:
            return None
        return _from_words(", ".join(line.text.rstrip(" ,") for line in taken), (), anchor.image,
                           [w for line in taken for w in line.words])


def _from_words(text: str, groups: tuple, image: int, words: list[Word]) -> Found:
    box = None
    for w in words:
        box = _union(box, (w.left, w.top, w.right, w.bottom))
    confs = [w.confidence for w in words if w.confidence >= 0]
    confidence = round(sum(confs) / len(confs) / 100, 2) if confs else None
    return Found(text, tuple(groups), image, confidence, box)


def _union(a: Box | None, b: Box | None) -> Box | None:
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def _mean(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(sum(present) / len(present), 2) if present else None

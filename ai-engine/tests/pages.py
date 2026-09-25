"""Fake OCR output for tests. Words are 10 px per character, 20 px tall, 8 px apart."""
from app.ocr import Line, Page, Paragraph, Word


def page(confidence: float, *paragraphs: str, image: int = 0) -> Page:
    """One paragraph per argument ('\\n' separates lines), stacked top to bottom at x=10."""
    result, y = [], 10
    for paragraph in paragraphs:
        lines = []
        for line in paragraph.split("\n"):
            lines.append(Line(_words(line, 10, y, confidence)))
            y += 30
        result.append(Paragraph(lines))
        y += 20
    return Page(image, result)


def layout(confidence: float, *blocks: tuple[int, int, str], image: int = 0) -> Page:
    """Each block is (x, y, text): a one-line paragraph at that position, like a label's table cells."""
    return Page(image, [Paragraph([Line(_words(text, x, y, confidence))]) for x, y, text in blocks])


def _words(line: str, x: int, y: int, confidence: float) -> list[Word]:
    words = []
    for w in line.split():
        words.append(Word(w, confidence, x, y, len(w) * 10, 20))
        x += len(w) * 10 + 8
    return words

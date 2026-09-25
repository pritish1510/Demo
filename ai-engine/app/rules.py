"""
Screens OCR'd label text against the mandatory declarations of the Legal Metrology (Packaged
Commodities) Rules, 2011, Rule 6(1), plus FSSAI basics for food. Results are screening flags for
an inspector, never a legal determination:

  PASS                 declaration detected and looks complete
  POTENTIAL_SHORTFALL  detected, but something required appears to be missing
  REVIEW_REQUIRED      not detected or not legible (OCR can miss text, so absence is not proof)
  LOW_CONFIDENCE       would pass, but OCR confidence is too low to rely on
  NOT_APPLICABLE       the rule does not apply to this product
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .ocr import Page
from .text import Found, LabelText, clean

PASS = "PASS"
POTENTIAL_SHORTFALL = "POTENTIAL_SHORTFALL"
REVIEW_REQUIRED = "REVIEW_REQUIRED"
LOW_CONFIDENCE = "LOW_CONFIDENCE"
NOT_APPLICABLE = "NOT_APPLICABLE"

MIN_CONFIDENCE = 0.60


@dataclass(frozen=True)
class Rule:
    id: str
    label: str


MFR = Rule("LMPC-6-1-A-MFR", "Manufacturer / packer")
GENERIC = Rule("LMPC-6-1-C-GENERIC", "Common / generic name")
NET_QTY = Rule("LMPC-6-1-D-NETQTY", "Net quantity")
MRP = Rule("LMPC-6-1-E-MRP", "MRP (inclusive of taxes)")
PACK_DATE = Rule("LMPC-6-1-F-PKDATE", "Month and year of packing")
CARE = Rule("LMPC-6-1-G-CARE", "Consumer care details")
ORIGIN = Rule("LMPC-6-1-B-ORIGIN", "Country of origin")
FSSAI = Rule("FSSAI-LBL-LICENSE", "FSSAI licence number")
BEST_BEFORE = Rule("FSSAI-LBL-BEST-BEFORE", "Best before / expiry")

STANDARD_RULES = [MFR, GENERIC, NET_QTY, MRP, PACK_DATE, CARE, ORIGIN]
FOOD_RULES = [FSSAI, BEST_BEFORE]
FOOD_CATEGORIES = {"FOOD", "BEVERAGES"}


@dataclass
class Context:
    product_name: str | None = None
    category: str | None = None
    context_type: str | None = None
    origin_type: str | None = None


@dataclass
class Finding:
    rule: Rule
    status: str
    extracted_value: str | None = None
    evidence_text: str | None = None
    confidence: float | None = None
    box: tuple[int, int, int, int] | None = None
    image: int | None = None

    def to_json(self) -> dict:
        return {
            "ruleId": self.rule.id,
            "fieldName": self.rule.label,
            "status": self.status,
            "extractedValue": self.extracted_value,
            "evidenceText": self.evidence_text,
            "confidence": self.confidence,
            "evidenceBoundingBox": list(self.box) if self.box else None,
            "imageIndex": self.image,
            "needsInspectorReview": self.status not in (PASS, NOT_APPLICABLE),
        }


# ---- Patterns ----

I = re.IGNORECASE
LETTER = r"[^\W\d_]"

MFR_RE = re.compile(
    r"\b(?:(?:manufactured|mfd\.?|mfg\.?|marketed|mktd\.?|mkt\.?|packed|imported|distributed)"
    r"(?:\s*(?:&|and|/)\s*(?:packed|marketed|mktd\.?|mkt\.?|distributed))?\s*(?:by|for)|manufacturer|packer|importer)\b"
    r"\s*[:\-]?[ \t]*([^\n]*(?:\n[^\n]+){0,3})", I)
PIN_CODE = re.compile(r"(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)")
# Lines that name a company or give an address are never the generic name ("VILE PARLE EAST").
NOT_A_NAME = re.compile(r"\b(?:pvt|ltd|limited|llp|inc|by|road|rd|street|nagar|east|west|north|south|crossing)\b|,|(?<!\d)\d{6}(?!\d)", I)

GENERIC_EXPLICIT = re.compile(
    r"\b(?:(?:generic|common)\s*name(?:\s*of\s*(?:the\s*)?(?:product|commodity))?"
    r"|name\s*of\s*(?:the\s*)?(?:product|commodity))\s*[:\-]?[ \t]*([^\n]*)", I)
NAME_WORDS = re.compile(LETTER + r"{3,}(?:[ \-]" + LETTER + r"{2,}){0,4}")
NAME_STOPWORDS = {"and", "the", "for", "with", "pack", "new", "sample", "gms", "ltr", "pcs", "mrp"}

UNIT = r"(kgs?|g|gms?|grams?|mg|ltrs?|litres?|liters?|l|ml|cl|nos?|n|pcs|pieces|units?|u|cm|mm|m)"
NOT_LETTER = r"(?!" + LETTER + r")"
NET_WORD_RE = re.compile(r"\bnet\.?\s*(?:qty|quantity|wt|weight|contents?|vol(?:ume)?|mass)\b\.?", I)
NET_QTY_RE = re.compile(
    r"\bnet\.?\s*(?:(?:qty|quantity|wt|weight|contents?|vol(?:ume)?|mass)\b\.?)?\s*[:\-]?\s*"
    r"(\d+(?:[.,]\d+)?)\s*" + UNIT + NOT_LETTER, I)
QTY_RE = re.compile(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*" + UNIT + NOT_LETTER, I)
BARE_QTY_RE = re.compile(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(kgs?|g|gms?|mg|ml|ltrs?|l)" + NOT_LETTER, I)
# Common abbreviations that are not the standard unit symbols the rules require.
NON_STANDARD_UNITS = {"kgs", "gm", "gms", "ltr", "ltrs", "nos", "pcs"}

# Price: optional currency, number; "?" right after it marks an illegible digit. Never a unit price
# ("0.15/g") or a quantity ("200 g").
PRICE = (r"(?<![\d/.,])((?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d{1,2})?)(?![\d.,])(\?)?"
         r"(?!\s*(?:/|%|(?:g|kg|mg|ml|l|gm|gms)\b))")
MRP_WORD = r"\b(?:m\.?\s?r\.?\s?p\b\.?|maximum\s+retail\s+price)"
MRP_WORD_RE = re.compile(MRP_WORD, I)
# OCR often turns ₹ into a stray symbol, and "(Incl. of all taxes)" can sit between MRP and the price.
MRP_RE = re.compile(MRP_WORD + r"\s*[^\w\s(]?\s*(?:\([^)\n]{0,40}\)\s*)?[:\-]?\s*" + PRICE, I)
PRICE_RE = re.compile(PRICE, I)
TAXES = re.compile(r"incl(?:\.|usive|uding)?\s*(?:of\s*)?all\s*tax(?:es)?", I)

# The lookahead stops "Mfd. by" / "Mfg. & Mkt. by" (manufacturer lines) being read as a date keyword.
PACK_KEYWORD = (
    r"\b(?:pkd|packed\s*on|packing\s*date|date\s*of\s*(?:packing|packaging|manufactur(?:e|ing)|mfg)|mfd|mfg"
    r"|manufactured\s*on|month\s*(?:and|&)\s*year\s*of\s*(?:packing|manufacture))\b"
    r"(?!\.?\s*(?:(?:&|and|/)\s*(?:mktd\.?|mkt\.?|marketed|packed)\s*)?(?:by|for)\b)\.?")
PACK_KEYWORD_RE = re.compile(PACK_KEYWORD, I)
PACK_DATE_RE = re.compile(PACK_KEYWORD + r"\s*(?:on|date|dt\.?)?\s*[:\-]?\s*([^\n]{0,24})", I)

CARE_WORD_RE = re.compile(
    r"\b(?:(?:consumer|customer)\s*(?:care|complaints?|service|helpline|feedback)|complaints?|helpline"
    r"|toll[\s\-]*free|contact\s*us|write\s*to\s*us)\b", I)
PHONE_RE = re.compile(r"(?<![\d\-])(\+?\d[\d \-]{8,16}\d)(?![\d\-])")
EMAIL_RE = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+")

ORIGIN_RE = re.compile(
    r"\b(?:country\s*of\s*origin|made\s*in|product\s*of|manufactured\s*in)\s*[:\-]?\s*("
    + LETTER + r"+(?:[ .]" + LETTER + r"+){0,2})", I)

FSSAI_NUMBER_RE = re.compile(
    r"\b(?:fssai|lic(?:en[cs]e)?\.?)\s*(?:lic(?:en[cs]e)?\.?\s*)?(?:no\.?|number|#)?\s*[:\-]?\s*(\d(?:\s?\d){13})(?!\d)", I)
FOURTEEN_DIGITS_RE = re.compile(r"(?<!\d)(\d(?:\s?\d){13})(?!\d)")
FSSAI_WORD_RE = re.compile(r"\bf\s?ssa[i1l]\b", I)

BEST_BEFORE_RE = re.compile(
    r"\b(?:best\s*before|use\s*by|expiry(?:\s*date)?|exp(?:\.|\b)(?:\s*date)?)\.?\s*[:\-]?\s*([^\n]{0,40})", I)
DURATION_RE = re.compile(r"\d+\s*(?:months?|days?|weeks?|years?|yrs?)\b", I)

DATE_RE = re.compile(
    r"(?<!\d)(?:0?[1-9]|[12]\d|3[01])\s*[/.\-]\s*(?:0?[1-9]|1[0-2])\s*[/.\-]\s*(?:\d{4}|\d{2})(?!\d)"  # 14/08/2026
    r"|(?<!\d)(?:0?[1-9]|1[0-2])\s*[/.\-]\s*(?:\d{4}|\d{2})(?!\d)"  # 08/2026
    r"|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[\-/.,']?\s*(?:\d{4}|\d{2})(?!\d)", I)  # AUG 2026


# ---- Entry points ----

NO_TEXT = "No label text could be read from the uploaded images. Verify this declaration on the package image."


def applicable(ctx: Context) -> list[Rule]:
    rules = list(STANDARD_RULES)
    if (ctx.category or "").upper() in FOOD_CATEGORIES:
        rules += FOOD_RULES
    return rules


def unreadable(ctx: Context, reason: str) -> list[Finding]:
    """Every applicable rule marked Review Required with `reason` — used when nothing could be read."""
    return [_origin_not_applicable() if r is ORIGIN and _indian(ctx) else _not_detected(r, reason)
            for r in applicable(ctx)]


def evaluate(ctx: Context, pages: list[Page]) -> list[Finding]:
    """Screen one OCR pass (one Page per image)."""
    text = LabelText(pages)
    if text.empty:
        return unreadable(ctx, NO_TEXT)
    return [_CHECKS[r.id](text, ctx) for r in applicable(ctx)]


_RANK = {PASS: 0, NOT_APPLICABLE: 0, LOW_CONFIDENCE: 1, POTENTIAL_SHORTFALL: 2, REVIEW_REQUIRED: 3}


def evaluate_passes(ctx: Context, passes: list[list[Page]]) -> list[Finding]:
    """
    Screen several OCR passes over the same images. Each pass reads some text better than the others
    (psm 3 keeps addresses together, psm 11 finds table cells), so per rule keep the most complete
    finding: best status, then one with located evidence, then the highest OCR confidence.
    """
    per_pass = [evaluate(ctx, pages) for pages in passes]
    if not per_pass:
        return unreadable(ctx, NO_TEXT)
    return [min(column, key=lambda f: (_RANK.get(f.status, 3), f.box is None, -(f.confidence or 0)))
            for column in zip(*per_pass)]


def summarize(findings: list[Finding]) -> dict:
    keys = {PASS: "pass", POTENTIAL_SHORTFALL: "potentialShortfall", REVIEW_REQUIRED: "reviewRequired",
            LOW_CONFIDENCE: "lowConfidence", NOT_APPLICABLE: "notApplicable"}
    summary = dict.fromkeys(keys.values(), 0)
    for f in findings:
        summary[keys[f.status]] += 1
    return summary


# ---- Rules ----

def _manufacturer(t: LabelText, ctx: Context) -> Finding:
    f = t.find(MFR_RE)
    if f is None:
        return _not_detected(MFR, "No manufacturer / packer / importer declaration detected on the images.")
    value = _join_lines(f.raw(1) or "")
    if not value:  # heading on its own line: the name and address sit underneath it
        below = t.lines_after(f, count=4)
        if below is None:
            return _found(MFR, REVIEW_REQUIRED, None, f, "name and address could not be read")
        f, value = f.join(below), below.text
    if not PIN_CODE.search(value):  # the address may continue below what the pattern captured
        more = t.lines_after(f, count=2)
        if more is not None and PIN_CODE.search(more.text):
            f, value = f.join(more), f"{value}, {more.text}"
    value = _truncate(value, 160)
    if PIN_CODE.search(value):
        return _found(MFR, PASS, value, f)
    return _found(MFR, POTENTIAL_SHORTFALL, value, f, "complete address with PIN code not detected")


def _generic_name(t: LabelText, ctx: Context) -> Finding:
    f = t.find(GENERIC_EXPLICIT)
    if f is not None:
        value = f.group(1)
        if not value:
            name = t.near(f, NAME_WORDS)
            if name is None:
                return _found(GENERIC, REVIEW_REQUIRED, None, f, "'generic name' heading found but no name could be read next to it")
            f, value = f.join(name), name.text
        return _found(GENERIC, PASS, value, f)
    # The generic noun is usually the last word of the product name ("Parle-G Biscuits"), and brand
    # words also turn up in company names and addresses, so try the words from last to first.
    for word in reversed(_product_name_words(ctx.product_name)):
        line = t.find(re.compile(r"\b" + re.escape(word), I), whole_line=True, accept=lambda x: not NOT_A_NAME.search(x.text))
        if line is not None:
            return _found(GENERIC, PASS, line.text, line, "matches the product name entered for this inspection")
    return _not_detected(GENERIC, "No common / generic name detected on the images.")


def _net_quantity(t: LabelText, ctx: Context) -> Finding:
    f = t.find(NET_QTY_RE)
    heading = None
    if f is None:
        heading = t.find(NET_WORD_RE)
        value = t.near(heading, QTY_RE) if heading else None
        f = heading.join(value) if value else None
    if f is None:
        bare = t.find(BARE_QTY_RE)
        if bare is not None:
            return _found(NET_QTY, REVIEW_REQUIRED, f"{bare.group(1)} {bare.group(2)}", bare,
                          "quantity found but not declared as net quantity")
        if heading is not None:
            return _found(NET_QTY, REVIEW_REQUIRED, None, heading, "net quantity heading found but the quantity could not be read")
        return _not_detected(NET_QTY, "No net quantity declaration detected on the images.")
    unit = f.group(2)
    value = f"{f.group(1)} {unit}"
    if unit.lower() in NON_STANDARD_UNITS:
        return _found(NET_QTY, POTENTIAL_SHORTFALL, value, f, f"'{unit}' is not a standard unit symbol (use g, kg, ml, l)")
    return _found(NET_QTY, PASS, value, f)


def _mrp(t: LabelText, ctx: Context) -> Finding:
    f = t.find(MRP_RE)
    if f is None:
        heading = t.find(MRP_WORD_RE)
        if heading is None:
            return _not_detected(MRP, "No MRP declaration detected on the images.")
        price = t.near(heading, PRICE_RE)
        if price is None:
            return _found(MRP, REVIEW_REQUIRED, None, heading, "MRP heading found but the price could not be read")
        f = heading.join(price)
    value = f"MRP {f.group(1)}"
    if f.raw(2):
        return _found(MRP, REVIEW_REQUIRED, value, f, "price is partly illegible")
    if t.contains(TAXES):
        return _found(MRP, PASS, value, f)
    return _found(MRP, POTENTIAL_SHORTFALL, value, f, "'inclusive of all taxes' not detected")


def _pack_date(t: LabelText, ctx: Context) -> Finding:
    f = t.find(PACK_DATE_RE)
    if f is None:
        return _not_detected(PACK_DATE, "No packing / manufacturing date detected on the images.")
    rest = f.group(1) or ""
    date = find_date(rest)
    if date:
        return _found(PACK_DATE, PASS, date, f)
    heading = t.find(PACK_KEYWORD_RE)
    beside = t.near(heading, DATE_RE) if heading else None
    if beside is not None:
        return _found(PACK_DATE, PASS, beside.text, heading.join(beside))
    return _found(PACK_DATE, REVIEW_REQUIRED, rest or None, f, "month and year of packing could not be read")


def _consumer_care(t: LabelText, ctx: Context) -> Finding:
    heading = t.find(CARE_WORD_RE, whole_line=True)
    phone = t.find(PHONE_RE, accept=lambda f: _valid_phone(f.group(1)))
    email = t.find(EMAIL_RE)
    if phone is None and email is None:
        if heading is not None:
            return _found(CARE, POTENTIAL_SHORTFALL, None, heading, "consumer care heading found but no telephone number or e-mail detected")
        return _not_detected(CARE, "No consumer care details detected on the images.")

    contacts = [c for c in (phone, email) if c is not None]
    combined = heading or contacts[0]
    for c in contacts:
        if c is not combined and c.text not in combined.text:
            combined = combined.join(c)
    value = ", ".join(c.text for c in contacts)
    if phone is not None and email is not None:
        return _found(CARE, PASS, value, combined)
    return _found(CARE, POTENTIAL_SHORTFALL, value, combined,
                  "no telephone number detected" if phone is None else "no e-mail address detected")


def _origin(t: LabelText, ctx: Context) -> Finding:
    if _indian(ctx):
        return _origin_not_applicable()
    f = t.find(ORIGIN_RE)
    if f is not None:
        return _found(ORIGIN, PASS, f.group(1), f)
    return _not_detected(ORIGIN, "Country of origin not detected — required for imported products.")


def _fssai_licence(t: LabelText, ctx: Context) -> Finding:
    f = t.find(FSSAI_NUMBER_RE)
    if f is not None:
        return _found(FSSAI, PASS, re.sub(r"\s", "", f.group(1)), f)
    number = t.find(FOURTEEN_DIGITS_RE)
    if number is not None:
        return _found(FSSAI, REVIEW_REQUIRED, re.sub(r"\s", "", number.group(1)), number,
                      "14-digit number found but not labelled as an FSSAI licence")
    mark = t.find(FSSAI_WORD_RE)
    if mark is not None:
        return _found(FSSAI, REVIEW_REQUIRED, None, mark, "FSSAI mark found but the 14-digit licence number could not be read")
    return _not_detected(FSSAI, "No FSSAI licence number detected on the images.")


def _best_before(t: LabelText, ctx: Context) -> Finding:
    f = t.find(BEST_BEFORE_RE)
    if f is None:
        return _not_detected(BEST_BEFORE, "No best-before / expiry declaration detected on the images.")
    rest = f.group(1) or ""
    date = find_date(rest)
    if date or DURATION_RE.search(rest):
        return _found(BEST_BEFORE, PASS, date or rest, f)
    beside = t.near(f, DATE_RE)
    if beside is not None:
        return _found(BEST_BEFORE, PASS, beside.text, f.join(beside))
    return _found(BEST_BEFORE, REVIEW_REQUIRED, rest or None, f, "date or shelf life could not be read")


_CHECKS = {
    MFR.id: _manufacturer,
    GENERIC.id: _generic_name,
    NET_QTY.id: _net_quantity,
    MRP.id: _mrp,
    PACK_DATE.id: _pack_date,
    CARE.id: _consumer_care,
    ORIGIN.id: _origin,
    FSSAI.id: _fssai_licence,
    BEST_BEFORE.id: _best_before,
}


# ---- Helpers ----

def _found(rule: Rule, status: str, value: str | None, f: Found, note: str | None = None) -> Finding:
    evidence = f"{f.text} — {note}" if note else f.text
    if status == PASS and f.confidence is not None and f.confidence < MIN_CONFIDENCE:
        status, evidence = LOW_CONFIDENCE, f"{f.text} — OCR confidence is low; verify on the image"
    return Finding(rule, status, value, evidence, f.confidence, f.box, f.image)


def _not_detected(rule: Rule, reason: str) -> Finding:
    return Finding(rule, REVIEW_REQUIRED, evidence_text=reason)


def _origin_not_applicable() -> Finding:
    return Finding(ORIGIN, NOT_APPLICABLE, evidence_text="Not required — product declared as Indian origin")


def _indian(ctx: Context) -> bool:
    return (ctx.origin_type or "").upper() == "INDIAN"


def _valid_phone(candidate: str) -> bool:
    """10-12 digit Indian phone numbers; rules out barcodes (13), FSSAI numbers (14) and PIN codes."""
    digits = re.sub(r"\D", "", candidate)
    if not 10 <= len(digits) <= 12:
        return False
    return digits.startswith(("0", "1800", "91")) or (len(digits) == 10 and digits[0] in "6789")


def _product_name_words(product_name: str | None) -> list[str]:
    """Distinct words of 3+ letters, in order. Matched as prefixes, so "Biscuit" also finds "Biscuits"."""
    words = re.split(r"[^\w]+|\d+|_", (product_name or "").lower())
    return [w for w in dict.fromkeys(words) if len(w) >= 3 and w not in NAME_STOPWORDS]


def find_date(s: str) -> str | None:
    m = DATE_RE.search(s)
    return clean(m.group()) if m else None


def _join_lines(raw: str) -> str:
    return clean(re.sub(r",?\s*\n\s*", ", ", raw)).strip(" ,:-")


def _truncate(s: str, limit: int) -> str:
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"

# VeriMetrix AI Inspection Engine

The OCR and rules service for VeriMetrix. The Spring Boot backend sends it the package images of an inspection; it reads the label text with Tesseract and checks the mandatory declarations, returning one finding per rule with the extracted value, OCR confidence and the location of the evidence on the image.

## Requirements

- Python 3.10+
- Tesseract OCR — `brew install tesseract` (macOS), `sudo apt install tesseract-ocr` (Linux), or the [Windows installer](https://github.com/UB-Mannheim/tesseract/wiki). If `tesseract` isn't on the PATH, set `TESSERACT_CMD` to its full path (on Windows the default install location is found automatically).

## Run

macOS / Linux:

```bash
cd ai-engine
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
```

Windows (PowerShell):

```powershell
cd ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Health check: http://localhost:8000/health → `{"status": "running", "ocr": "tesseract 5.5.0", ...}` (`"ocr": "unavailable"` means Tesseract wasn't found).

| Variable | Default | Purpose |
| --- | --- | --- |
| `TESSERACT_CMD` | `tesseract` on the PATH | Path to the Tesseract binary |
| `OCR_LANG` | `eng` | Tesseract language(s), e.g. `eng+hin` |
| `OCR_TARGET_LONG_SIDE` | `3000` | Small images are upscaled so their long side is about this many pixels |

## API

`POST /ai/inspect` — multipart form:

| Field | |
| --- | --- |
| `files` | One or more images (every panel of the package) |
| `inspectionId` | Echoed back |
| `category` | `FOOD`, `BEVERAGES`, `COSMETICS`, … — food and beverages add the FSSAI rules |
| `originType` | `INDIAN`, `IMPORTED`, `UNKNOWN` — country of origin is not applicable to Indian products |
| `productName` | Used to find the generic name on the label |
| `contextType` | `RETAIL_PACKAGE`, `BULK_INSTITUTIONAL`, `ECOMMERCE_LISTING` |

Response:

```json
{
  "inspectionId": "12",
  "status": "REVIEW_REQUIRED",
  "summary": {"pass": 7, "potentialShortfall": 1, "reviewRequired": 0, "lowConfidence": 0, "notApplicable": 1},
  "results": [
    {
      "ruleId": "LMPC-6-1-D-NETQTY",
      "fieldName": "Net quantity",
      "status": "PASS",
      "extractedValue": "200 g",
      "evidenceText": "NET WEIGHT 200 g",
      "confidence": 0.94,
      "evidenceBoundingBox": [188, 623, 316, 701],
      "imageIndex": 0,
      "needsInspectorReview": false
    }
  ],
  "metadata": [{"fileName": "back.jpg", "width": 1536, "height": 1024, "ocrText": "..."}],
  "ocr": "tesseract 5.5.0"
}
```

- `evidenceBoundingBox` is `[x1, y1, x2, y2]` in pixels of the uploaded image (after EXIF rotation, as browsers display it); `imageIndex` is the position of that image in `files`.
- Statuses: `PASS`, `POTENTIAL_SHORTFALL`, `REVIEW_REQUIRED`, `LOW_CONFIDENCE`, `NOT_APPLICABLE` — screening flags for an inspector, never a legal determination.

## How it works

- [`app/ocr.py`](app/ocr.py) — preprocessing (EXIF rotation, upscaling, contrast, adaptive threshold) and three Tesseract passes per image with word-level boxes and confidence.
- [`app/text.py`](app/text.py) — the OCR text as searchable paragraphs that map back to word boxes, plus layout helpers that find a value beside or below its heading.
- [`app/rules.py`](app/rules.py) — the rules. Each pass is screened separately and the most complete reading per rule is kept.

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

`tests/test_api.py::test_real_ocr_on_the_parle_g_label` runs real OCR on `test.png` and is skipped when Tesseract isn't installed.

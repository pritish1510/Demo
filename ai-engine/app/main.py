"""VeriMetrix AI inspection engine: OCR + labelling rules. Called by the Spring Boot backend."""
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import pytesseract

from . import ocr, rules

app = FastAPI(title="VeriMetrix AI Inspection Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OCR_MISSING = ("Tesseract OCR is not installed on the AI engine, so the label was not read. "
               "Verify this declaration on the package image.")


def _ocr_status() -> str:
    version = ocr.tesseract_version()
    return f"tesseract {version}" if version else "unavailable"


@app.get("/health")
def health():
    return {
        "application": "VeriMetrix AI Engine",
        "status": "running",
        "ocr": _ocr_status(),
        "tesseractPath": pytesseract.pytesseract.tesseract_cmd,
    }


# Plain `def` (not async): OCR blocks for seconds, so FastAPI runs this in its thread pool.
@app.post("/ai/inspect")
def inspect(
    files: list[UploadFile] = File(...),
    inspectionId: str | None = Form(None),
    category: str | None = Form(None),
    originType: str | None = Form(None),
    productName: str | None = Form(None),
    contextType: str | None = Form(None),
):
    ctx = rules.Context(product_name=productName, category=category, context_type=contextType, origin_type=originType)

    if ocr.tesseract_version() is None:
        findings = rules.unreadable(ctx, OCR_MISSING)
        metadata = [{"fileName": f.filename} for f in files]
    else:
        scans = [ocr.scan(f.file.read(), i) for i, f in enumerate(files)]
        # passes[p] = OCR pass p over every image, so rules can combine declarations across panels.
        passes = [[s.passes[p] for s in scans] for p in range(len(ocr.PASSES))]
        findings = rules.evaluate_passes(ctx, passes)
        metadata = [
            {"fileName": f.filename, "width": s.width, "height": s.height, "ocrText": s.passes[0].text,
             **({"error": s.error} if s.error else {})}
            for f, s in zip(files, scans)
        ]

    overall = "COMPLETED" if all(f.status in (rules.PASS, rules.NOT_APPLICABLE) for f in findings) else "REVIEW_REQUIRED"
    return {
        "inspectionId": inspectionId,
        "status": overall,
        "overallStatus": overall,
        "summary": rules.summarize(findings),
        "results": [f.to_json() for f in findings],
        "metadata": metadata,
        "engine": "VeriMetrix OCR + compliance rules",
        "ocr": _ocr_status(),
    }

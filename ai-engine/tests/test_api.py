from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main, ocr
from tests.pages import page

client = TestClient(main.app)
TEST_IMAGE = Path(__file__).resolve().parent.parent / "test.png"


def post(files, **form):
    return client.post("/ai/inspect", files=[("files", f) for f in files], data=form)


def test_without_tesseract_every_rule_needs_review(monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_version", lambda: None)

    body = post([("a.png", b"x", "image/png")], inspectionId="7", category="FOOD", originType="INDIAN").json()

    assert body["ocr"] == "unavailable"
    assert body["status"] == "REVIEW_REQUIRED"
    assert len(body["results"]) == 9
    origin = next(r for r in body["results"] if r["ruleId"] == "LMPC-6-1-B-ORIGIN")
    assert origin["status"] == "NOT_APPLICABLE"
    assert all("Tesseract" in r["evidenceText"] for r in body["results"] if r is not origin)


def test_response_follows_the_backend_contract(monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_version", lambda: "5.5.0")
    fake = page(90, "Net Wt. 200 g", "MRP Rs. 100 (Incl. of all taxes)")

    def fake_scan(data, image_index):
        fake.image = image_index
        return ocr.ImageScan([fake] * len(ocr.PASSES), 600, 800)

    monkeypatch.setattr(ocr, "scan", fake_scan)

    body = post([("back.png", b"png", "image/png")], inspectionId="3", category="COSMETICS", originType="INDIAN").json()

    assert body["inspectionId"] == "3"
    assert body["metadata"] == [{"fileName": "back.png", "width": 600, "height": 800, "ocrText": fake.text}]
    net = next(r for r in body["results"] if r["ruleId"] == "LMPC-6-1-D-NETQTY")
    assert net == {
        "ruleId": "LMPC-6-1-D-NETQTY", "fieldName": "Net quantity", "status": "PASS", "extractedValue": "200 g",
        "evidenceText": "Net Wt. 200 g", "confidence": 0.9, "evidenceBoundingBox": [10, 10, 134, 30],
        "imageIndex": 0, "needsInspectorReview": False,
    }
    assert body["summary"]["pass"] == 2


def test_a_file_that_is_not_an_image_reads_as_no_text():
    scan = ocr.scan(b"definitely not an image", 0)
    assert scan.error and all(not p.paragraphs for p in scan.passes)


def test_health(monkeypatch):
    monkeypatch.setattr(ocr, "tesseract_version", lambda: "5.5.0")
    assert client.get("/health").json()["ocr"] == "tesseract 5.5.0"


@pytest.mark.skipif(ocr.tesseract_version() is None, reason="Tesseract is not installed")
def test_real_ocr_on_the_parle_g_label():
    body = post([("test.png", TEST_IMAGE.read_bytes(), "image/png")],
                category="FOOD", originType="INDIAN", productName="Parle-G Biscuits").json()

    r = {x["ruleId"]: x for x in body["results"]}
    assert body["status"] == "COMPLETED", {k: (v["status"], v["evidenceText"]) for k, v in r.items()}
    assert r["LMPC-6-1-C-GENERIC"]["extractedValue"] == "BISCUITS"
    assert r["LMPC-6-1-D-NETQTY"]["extractedValue"] == "200 g"
    assert r["LMPC-6-1-E-MRP"]["extractedValue"] == "MRP 30.00"
    assert r["LMPC-6-1-F-PKDATE"]["extractedValue"] == "12/07/2026"
    assert r["LMPC-6-1-G-CARE"]["extractedValue"] == "022-6691 6929, cs@parle.biz"
    assert r["FSSAI-LBL-LICENSE"]["extractedValue"] == "10013022002253"
    assert r["FSSAI-LBL-BEST-BEFORE"]["extractedValue"] == "11/01/2027"
    assert "400057" in r["LMPC-6-1-A-MFR"]["extractedValue"]
    assert all(x["evidenceBoundingBox"] for x in body["results"] if x["status"] == "PASS")

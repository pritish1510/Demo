from app import rules
from app.ocr import Page
from app.rules import (LOW_CONFIDENCE, NOT_APPLICABLE, PASS, POTENTIAL_SHORTFALL, REVIEW_REQUIRED, Context,
                       evaluate, evaluate_passes, find_date)
from tests.pages import layout, page

BISCUIT = Context("Cream Biscuits 200 g", "FOOD", "RETAIL_PACKAGE", "INDIAN")


def by_rule(findings):
    return {f.rule.id: f for f in findings}


def test_compliant_food_label_passes_every_rule():
    label = page(92,
                 "Cream Biscuits",
                 "Manufactured by: Sunrise Foods Pvt. Ltd.,\nPlot 14, MIDC Bhosari, Pune 411026",
                 "Net Wt. 200 g",
                 "MRP Rs. 100.00 (Incl. of all taxes)",
                 "PKD: 06/2026 Best before 9 months from packaging",
                 "For consumer complaints contact:\n1800-102-3344, care@sunrisefoods.in",
                 "FSSAI Lic. No. 10012022000123")

    r = by_rule(evaluate(BISCUIT, [label]))

    assert len(r) == 9
    for rule_id, f in r.items():
        assert f.status == (NOT_APPLICABLE if rule_id == "LMPC-6-1-B-ORIGIN" else PASS), (rule_id, f.evidence_text)
    assert r["LMPC-6-1-A-MFR"].extracted_value == "Sunrise Foods Pvt. Ltd., Plot 14, MIDC Bhosari, Pune 411026"
    assert r["LMPC-6-1-C-GENERIC"].extracted_value == "Cream Biscuits"
    assert r["LMPC-6-1-D-NETQTY"].extracted_value == "200 g"
    assert r["LMPC-6-1-E-MRP"].extracted_value == "MRP Rs. 100.00"
    assert r["LMPC-6-1-F-PKDATE"].extracted_value == "06/2026"
    assert r["LMPC-6-1-G-CARE"].extracted_value == "1800-102-3344, care@sunrisefoods.in"
    assert r["FSSAI-LBL-LICENSE"].extracted_value == "10012022000123"
    assert r["LMPC-6-1-D-NETQTY"].confidence == 0.92


def test_incomplete_declarations_are_flagged_with_the_reason():
    label = page(90,
                 "Herbal Face Wash",
                 "Marketed by: Vana Naturals, Baddi",
                 "Net Qty: 100 gms",
                 "MRP Rs. 199",
                 "PKD: 14/0?/2026",
                 "Customer care: care@vana.in")
    ctx = Context("Herbal Neem Face Wash", "COSMETICS", "RETAIL_PACKAGE", "IMPORTED")

    r = by_rule(evaluate(ctx, [label]))

    assert len(r) == 7  # no FSSAI rules outside food
    assert r["LMPC-6-1-A-MFR"].status == POTENTIAL_SHORTFALL and "PIN code" in r["LMPC-6-1-A-MFR"].evidence_text
    assert r["LMPC-6-1-D-NETQTY"].status == POTENTIAL_SHORTFALL and "'gms'" in r["LMPC-6-1-D-NETQTY"].evidence_text
    assert r["LMPC-6-1-E-MRP"].status == POTENTIAL_SHORTFALL
    assert r["LMPC-6-1-F-PKDATE"].status == REVIEW_REQUIRED
    assert r["LMPC-6-1-G-CARE"].status == POTENTIAL_SHORTFALL and "no telephone number" in r["LMPC-6-1-G-CARE"].evidence_text
    assert r["LMPC-6-1-B-ORIGIN"].status == REVIEW_REQUIRED  # imported, origin not found
    assert r["LMPC-6-1-C-GENERIC"].status == PASS


def test_evidence_box_covers_the_matched_words_on_the_right_image():
    front = page(95, "Cream Biscuits", image=0)
    back = page(95, "Ingredients: wheat flour, sugar", "MRP Rs. 100 (Incl. of all taxes)", image=1)

    mrp = by_rule(evaluate(BISCUIT, [front, back]))["LMPC-6-1-E-MRP"]

    assert mrp.image == 1
    assert mrp.box == (10, 60, 116, 80)  # "MRP Rs. 100"


def test_values_laid_out_beside_or_below_their_heading():
    # Parle-G style: headings and values in separate table cells.
    label = layout(90,
                   (10, 10, "NET WEIGHT:"), (10, 40, "200 g"),
                   (200, 10, "MRP ₹"), (200, 30, "(INCL. OF ALL TAXES)"), (200, 55, "30.00"), (200, 80, "USP ₹0.15/g"),
                   (400, 10, "PKD.:"), (520, 10, "12/07/2026"),
                   (400, 40, "USE BY:"), (520, 40, "11/01/2027"))

    r = by_rule(evaluate(BISCUIT, [label]))

    assert (r["LMPC-6-1-D-NETQTY"].status, r["LMPC-6-1-D-NETQTY"].extracted_value) == (PASS, "200 g")
    assert (r["LMPC-6-1-E-MRP"].status, r["LMPC-6-1-E-MRP"].extracted_value) == (PASS, "MRP 30.00")
    assert (r["LMPC-6-1-F-PKDATE"].status, r["LMPC-6-1-F-PKDATE"].extracted_value) == (PASS, "12/07/2026")
    assert (r["FSSAI-LBL-BEST-BEFORE"].status, r["FSSAI-LBL-BEST-BEFORE"].extracted_value) == (PASS, "11/01/2027")
    assert r["LMPC-6-1-D-NETQTY"].box == (10, 10, 118, 60)  # heading + value


def test_manufacturer_address_under_its_heading():
    label = layout(90,
                   (10, 10, "MANUFACTURED BY:"), (10, 35, "PARLE BISCUITS PVT. LTD."),
                   (10, 60, "NORTH LEVEL CROSSING,"), (10, 85, "MUMBAI, MH - 400057, INDIA."))

    mfr = by_rule(evaluate(BISCUIT, [label]))["LMPC-6-1-A-MFR"]

    assert mfr.status == PASS
    assert mfr.extracted_value == "PARLE BISCUITS PVT. LTD., NORTH LEVEL CROSSING, MUMBAI, MH - 400057, INDIA."


def test_generic_name_skips_company_and_address_lines():
    label = page(90, "NORTH LEVEL CROSSING, VILE PARLE EAST,", "PARLE BISCUITS PVT. LTD.", "BISCUITS")
    generic = by_rule(evaluate(Context("Parle-G Biscuits", "FOOD", None, "INDIAN"), [label]))["LMPC-6-1-C-GENERIC"]
    assert (generic.status, generic.extracted_value) == (PASS, "BISCUITS")


def test_phone_numbers_with_spaces_but_not_barcodes():
    r = by_rule(evaluate(BISCUIT, [page(90, "Consumer care cell", "PHONE NO.: 022-6691 6929", "8 901719 100579")]))
    assert (r["LMPC-6-1-G-CARE"].status, r["LMPC-6-1-G-CARE"].extracted_value) == (POTENTIAL_SHORTFALL, "022-6691 6929")

    barcode_only = by_rule(evaluate(BISCUIT, [page(90, "Consumer care cell", "8 901719 100579")]))
    assert barcode_only["LMPC-6-1-G-CARE"].extracted_value is None


def test_low_ocr_confidence_downgrades_pass():
    net = by_rule(evaluate(BISCUIT, [page(45, "Net Wt. 200 g")]))["LMPC-6-1-D-NETQTY"]
    assert (net.status, net.confidence) == (LOW_CONFIDENCE, 0.45)


def test_manufacturer_line_is_not_mistaken_for_a_packing_date():
    date = by_rule(evaluate(BISCUIT, [page(90, "Mfd. & Mkt. by: ABC Foods, New Delhi 110001")]))["LMPC-6-1-F-PKDATE"]
    assert date.status == REVIEW_REQUIRED and date.box is None


def test_illegible_price_needs_review():
    mrp = by_rule(evaluate(BISCUIT, [page(90, "MRP ₹1?9 incl. of all taxes")]))["LMPC-6-1-E-MRP"]
    assert mrp.status == REVIEW_REQUIRED


def test_passes_are_merged_per_rule_keeping_the_most_complete_reading():
    missed_taxes = page(90, "MRP Rs. 100")
    read_taxes = page(80, "MRP Rs. 100 (Incl. of all taxes)")

    mrp = by_rule(evaluate_passes(BISCUIT, [[missed_taxes], [read_taxes]]))["LMPC-6-1-E-MRP"]

    assert mrp.status == PASS


def test_unreadable_images_mark_every_applicable_rule_for_review():
    findings = evaluate(BISCUIT, [Page(0)])
    assert len(findings) == 9
    for f in findings:
        assert f.status == (NOT_APPLICABLE if f.rule.id == "LMPC-6-1-B-ORIGIN" else REVIEW_REQUIRED)
        assert f.evidence_text


def test_dates_in_common_label_formats():
    assert find_date("06/2026") == "06/2026"
    assert find_date("14.06.26 B.No 7") == "14.06.26"
    assert find_date("JUN 2026") == "JUN 2026"
    assert find_date("14/0?/2026") is None


def test_summary_counts_statuses():
    findings = evaluate(BISCUIT, [Page(0)])
    assert rules.summarize(findings) == {"pass": 0, "potentialShortfall": 0, "reviewRequired": 8, "lowConfidence": 0, "notApplicable": 1}

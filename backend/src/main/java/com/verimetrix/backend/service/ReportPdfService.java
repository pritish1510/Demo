package com.verimetrix.backend.service;

import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.draw.LineSeparator;
import com.verimetrix.backend.dto.InspectionMapper;
import com.verimetrix.backend.model.Inspection;
import com.verimetrix.backend.model.RuleResult;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Server-side twin of the frontend Report page: same fields, same wording rule (screening flags,
 * never "violation").
 */
@Service
public class ReportPdfService {
    private static final Color INK = new Color(15, 23, 42);
    private static final Color MUTED = new Color(100, 116, 139);
    private static final Color TEAL = new Color(15, 118, 110);
    private static final Color RULE = new Color(203, 213, 225);
    private static final Color PANEL = new Color(248, 250, 252);

    private static final Map<String, String> STATUS_LABELS = Map.of(
            "PASS", "Pass", "POTENTIAL_SHORTFALL", "Potential Shortfall", "REVIEW_REQUIRED", "Review Required",
            "LOW_CONFIDENCE", "Low Confidence", "NOT_APPLICABLE", "Not Applicable", "COMPLETED", "Completed");
    private static final Map<String, Color> STATUS_COLORS = Map.of(
            "PASS", new Color(4, 120, 87), "COMPLETED", new Color(4, 120, 87), "POTENTIAL_SHORTFALL", new Color(194, 65, 12),
            "REVIEW_REQUIRED", new Color(161, 98, 7), "LOW_CONFIDENCE", new Color(185, 28, 28), "NOT_APPLICABLE", MUTED);
    private static final Map<String, String> REVIEW_LABELS = Map.of("CONFIRM", "Confirmed", "EDIT", "Corrected", "MARK_INCORRECT", "Marked incorrect");
    // Labels that differ from the plain humanized enum value (matches frontend statusUtils.js).
    private static final Map<String, String> LABELS = Map.of(
            "ECOMMERCE_LISTING", "E-commerce Listing", "BULK_INSTITUTIONAL", "Bulk / Institutional",
            "INDIAN", "Indian Product", "IMPORTED", "Imported Product");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final String DISCLAIMER = "This report contains AI screening results generated from package images. "
            + "Findings marked Potential Shortfall or Review Required are evidence-based flags requiring inspector review; "
            + "they are not a legal determination of non-compliance.";

    public byte[] render(Inspection i) {
        ZoneId zone = ZoneId.systemDefault();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 42, 42, 42, 42);
        PdfWriter.getInstance(doc, out);
        doc.open();

        PdfPTable header = table(3, 1);
        PdfPCell title = cell();
        title.addElement(new Paragraph("VERIMETRIX", font(15, Font.BOLD, TEAL)));
        title.addElement(new Paragraph("Packaging Compliance Screening Report", font(13, Font.BOLD, INK)));
        header.addCell(title);
        PdfPCell generated = cell();
        Paragraph when = new Paragraph("Generated\n" + DATE_TIME.format(ZonedDateTime.now(zone)), font(8, Font.NORMAL, MUTED));
        when.setAlignment(Element.ALIGN_RIGHT);
        generated.addElement(when);
        header.addCell(generated);
        doc.add(header);
        doc.add(new Paragraph(new Chunk(new LineSeparator(1.5f, 100, INK, Element.ALIGN_CENTER, -2))));

        PdfPTable meta = table(1, 1, 1);
        meta.setSpacingBefore(12);
        String[][] fields = {
                {"Inspection ID", i.getInspectionCode()},
                {"Product Name", i.getProductName()},
                {"Category", label(i.getCategory())},
                {"Inspection Date", DATE.format(i.getCreatedAt().atZone(zone))},
                {"Context", label(i.getContextType())},
                {"Origin", label(i.getOriginType())},
        };
        for (String[] f : fields) {
            PdfPCell c = cell();
            c.setPaddingBottom(8);
            c.addElement(new Paragraph(f[0].toUpperCase(Locale.ROOT), font(7, Font.BOLD, MUTED)));
            c.addElement(new Paragraph(text(f[1]), font(10, Font.NORMAL, INK)));
            meta.addCell(c);
        }
        doc.add(meta);

        Map<String, Integer> s = InspectionMapper.summary(i.getResults());
        PdfPTable overall = table(1);
        overall.setSpacingBefore(6);
        PdfPCell box = cell();
        box.setBackgroundColor(PANEL);
        box.setPadding(10);
        Paragraph result = new Paragraph();
        result.add(new Chunk("OVERALL RESULT   ", font(7, Font.BOLD, MUTED)));
        result.add(new Chunk(STATUS_LABELS.getOrDefault(i.getStatus(), humanize(i.getStatus())), font(11, Font.BOLD, statusColor(i.getStatus()))));
        box.addElement(result);
        box.addElement(new Paragraph("Pass: %d     Potential Shortfall: %d     Review Required: %d     Low Confidence: %d     Not Applicable: %d".formatted(
                s.get("pass"), s.get("potentialShortfall"), s.get("reviewRequired"), s.get("lowConfidence"), s.get("notApplicable")),
                font(9, Font.NORMAL, INK)));
        overall.addCell(box);
        doc.add(overall);

        Paragraph heading = new Paragraph("RULE-WISE FINDINGS", font(9, Font.BOLD, INK));
        heading.setSpacingBefore(16);
        heading.setSpacingAfter(6);
        doc.add(heading);

        PdfPTable findings = table(3.2f, 3.6f, 2.2f, 1f, 2.6f);
        findings.setHeaderRows(1);
        for (String h : List.of("Declaration", "Extracted Value", "AI Screening Result", "Conf.", "Inspector Review")) {
            PdfPCell c = new PdfPCell(new Phrase(h, font(8, Font.BOLD, INK)));
            c.setBorder(Rectangle.TOP | Rectangle.BOTTOM);
            c.setBorderColor(RULE);
            c.setBackgroundColor(PANEL);
            c.setPadding(5);
            findings.addCell(c);
        }
        for (RuleResult r : i.getResults()) {
            PdfPCell declaration = rowCell();
            declaration.addElement(new Paragraph(text(r.getFieldName()), font(9, Font.BOLD, INK)));
            declaration.addElement(new Paragraph(r.getRuleId(), font(7, Font.NORMAL, MUTED)));
            findings.addCell(declaration);

            PdfPCell value = rowCell();
            if ("EDIT".equals(r.getReviewAction())) {
                value.addElement(new Paragraph(text(r.getExtractedValue()), font(9, Font.STRIKETHRU, MUTED)));
                value.addElement(new Paragraph(text(r.getCorrectedValue()), font(9, Font.NORMAL, INK)));
            } else {
                value.addElement(new Paragraph(text(r.getExtractedValue()), font(9, Font.NORMAL, INK)));
            }
            findings.addCell(value);

            PdfPCell status = rowCell();
            status.addElement(new Paragraph(STATUS_LABELS.getOrDefault(r.getStatus(), humanize(r.getStatus())), font(9, Font.BOLD, statusColor(r.getStatus()))));
            findings.addCell(status);

            PdfPCell confidence = rowCell();
            Paragraph pct = new Paragraph(r.getConfidence() == null ? "—" : Math.round(r.getConfidence() * 100) + "%", font(9, Font.NORMAL, INK));
            pct.setAlignment(Element.ALIGN_RIGHT);
            confidence.addElement(pct);
            findings.addCell(confidence);

            PdfPCell review = rowCell();
            review.addElement(new Paragraph(r.getReviewAction() == null ? "Pending" : REVIEW_LABELS.getOrDefault(r.getReviewAction(), "Reviewed"), font(9, Font.NORMAL, INK)));
            if (r.getReviewNote() != null) review.addElement(new Paragraph(text(r.getReviewNote()), font(7.5f, Font.NORMAL, MUTED)));
            findings.addCell(review);
        }
        doc.add(findings);

        PdfPTable signatures = table(1, 0.15f, 1);
        signatures.setSpacingBefore(44);
        signatures.setKeepTogether(true);
        for (String label : new String[]{"Inspector Name & Signature", null, "Date"}) {
            PdfPCell c = cell();
            if (label != null) {
                c.setBorder(Rectangle.TOP);
                c.setBorderColor(MUTED);
                c.setPaddingTop(4);
                c.addElement(new Paragraph(label, font(8, Font.NORMAL, MUTED)));
            }
            signatures.addCell(c);
        }
        doc.add(signatures);

        Paragraph disclaimer = new Paragraph(DISCLAIMER, font(7.5f, Font.NORMAL, MUTED));
        disclaimer.setSpacingBefore(24);
        doc.add(disclaimer);

        doc.close();
        return out.toByteArray();
    }

    private static Font font(float size, int style, Color color) {
        return new Font(Font.HELVETICA, size, style, color);
    }

    private static PdfPTable table(float... widths) {
        PdfPTable t = new PdfPTable(widths);
        t.setWidthPercentage(100);
        return t;
    }

    private static PdfPCell cell() {
        PdfPCell c = new PdfPCell();
        c.setBorder(Rectangle.NO_BORDER);
        return c;
    }

    private static PdfPCell rowCell() {
        PdfPCell c = new PdfPCell();
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(RULE);
        c.setPadding(5);
        c.setPaddingTop(1);
        return c;
    }

    private static Color statusColor(String status) {
        return STATUS_COLORS.getOrDefault(status, MUTED);
    }

    /** The built-in Helvetica has no ₹ glyph. */
    private static String text(String s) {
        return s == null || s.isBlank() ? "—" : s.replace("₹", "Rs. ");
    }

    static String label(String v) {
        return v == null ? "—" : LABELS.getOrDefault(v, humanize(v));
    }

    static String humanize(String v) {
        if (v == null) return "—";
        return Arrays.stream(v.toLowerCase(Locale.ROOT).split("_"))
                .map(w -> w.isEmpty() ? w : Character.toUpperCase(w.charAt(0)) + w.substring(1))
                .collect(Collectors.joining(" "));
    }
}

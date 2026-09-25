package com.verimetrix.backend.dto;

import com.verimetrix.backend.model.Inspection;
import com.verimetrix.backend.model.InspectionImage;
import com.verimetrix.backend.model.RuleResult;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/** Entity → JSON shapes of the API contract the frontend is built against. */
public final class InspectionMapper {
    private InspectionMapper() {}

    public static Map<String, Object> inspection(Inspection i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", i.getId());
        m.put("inspectionCode", i.getInspectionCode());
        m.put("productName", i.getProductName());
        m.put("category", i.getCategory());
        m.put("contextType", i.getContextType());
        m.put("originType", i.getOriginType());
        m.put("status", i.getStatus());
        m.put("createdAt", i.getCreatedAt());
        m.put("images", i.getImages().stream().map(InspectionMapper::image).toList());
        m.put("summary", i.getResults().isEmpty() ? null : summary(i.getResults()));
        return m;
    }

    public static Map<String, Object> image(InspectionImage x) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", x.getId());
        m.put("fileName", x.getFileName());
        m.put("imageUrl", "/uploads/" + x.getStoredName());
        return m;
    }

    public static Map<String, Object> results(Inspection i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("inspectionId", i.getInspectionCode());
        m.put("inspectionCode", i.getInspectionCode());
        m.put("productName", i.getProductName());
        m.put("category", i.getCategory());
        m.put("overallStatus", i.getStatus());
        m.put("summary", summary(i.getResults()));
        m.put("results", i.getResults().stream().map(InspectionMapper::result).toList());
        return m;
    }

    public static Map<String, Object> result(RuleResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ruleId", r.getRuleId());
        m.put("fieldName", r.getFieldName());
        m.put("status", r.getStatus());
        m.put("extractedValue", r.getExtractedValue());
        m.put("evidenceText", r.getEvidenceText());
        m.put("confidence", r.getConfidence());
        m.put("evidenceBoundingBox", r.getEvidenceBoundingBox());
        m.put("needsInspectorReview", r.isNeedsInspectorReview());
        if (r.getImage() != null) {
            m.put("imageId", r.getImage().getId());
            m.put("imageUrl", "/uploads/" + r.getImage().getStoredName());
        }
        m.put("review", r.getReviewAction() == null ? null : review(r));
        return m;
    }

    public static Map<String, Object> review(RuleResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("action", r.getReviewAction());
        m.put("correctedValue", r.getCorrectedValue());
        m.put("note", r.getReviewNote());
        m.put("reviewedBy", r.getReviewedBy());
        m.put("reviewedAt", r.getReviewedAt());
        return m;
    }

    public static Map<String, Integer> summary(Collection<RuleResult> results) {
        Map<String, Integer> s = new LinkedHashMap<>();
        s.put("pass", 0);
        s.put("potentialShortfall", 0);
        s.put("reviewRequired", 0);
        s.put("lowConfidence", 0);
        s.put("notApplicable", 0);
        for (RuleResult r : results) {
            String key = switch (r.getStatus()) {
                case "PASS" -> "pass";
                case "POTENTIAL_SHORTFALL" -> "potentialShortfall";
                case "REVIEW_REQUIRED" -> "reviewRequired";
                case "LOW_CONFIDENCE" -> "lowConfidence";
                case "NOT_APPLICABLE" -> "notApplicable";
                default -> null;
            };
            if (key != null) s.merge(key, 1, Integer::sum);
        }
        return s;
    }
}

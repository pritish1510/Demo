package com.verimetrix.backend.service;

import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Client for the Python AI inspection engine (ai-engine/). Sends the package images plus the
 * product details that decide which rules apply to POST /ai/inspect, and returns one finding per rule.
 */
@Service
public class AiInspectionClient {
    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT = new ParameterizedTypeReference<>() {};

    public record Context(String productName, String category, String contextType, String originType) {}

    public record Image(Path path, String fileName) {}

    /**
     * @param boundingBox "[x1,y1,x2,y2]" in pixels of the uploaded image, or null
     * @param imageIndex  index into the images sent, or null when no evidence was located
     */
    public record Finding(String ruleId, String fieldName, String status, String extractedValue,
                          String evidenceText, Double confidence, String boundingBox, Integer imageIndex) {}

    /** @param ocr e.g. "tesseract 5.5.0", or "unavailable" */
    public record Health(boolean reachable, String ocr) {}

    private final String baseUrl;
    private final RestClient inspectClient;
    private final RestClient healthClient;

    public AiInspectionClient(@Value("${app.ai-url:http://localhost:8000}") String aiUrl,
                              @Value("${app.ai-timeout-seconds:180}") long timeoutSeconds) {
        this.baseUrl = aiUrl.replaceAll("/+$", "");
        this.inspectClient = client(Duration.ofSeconds(timeoutSeconds)); // OCR of several images takes a while
        this.healthClient = client(Duration.ofSeconds(3));
    }

    private RestClient client(Duration readTimeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(readTimeout);
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    public List<Finding> inspect(Long inspectionId, Context ctx, List<Image> images) {
        // A plain MultiValueMap, not MultipartBodyBuilder: that one needs Reactive Streams, which a
        // servlet app doesn't have (NoClassDefFoundError on first use).
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("inspectionId", String.valueOf(inspectionId));
        addIfPresent(body, "productName", ctx.productName());
        addIfPresent(body, "category", ctx.category());
        addIfPresent(body, "contextType", ctx.contextType());
        addIfPresent(body, "originType", ctx.originType());
        for (Image image : images) {
            body.add("files", new FileSystemResource(image.path()) {
                @Override
                public String getFilename() {
                    return image.fileName(); // the original upload name, not the stored UUID
                }
            });
        }

        Map<String, Object> response;
        try {
            response = inspectClient.post()
                    .uri("/ai/inspect")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(JSON_OBJECT);
        } catch (ResourceAccessException e) {
            throw new AiEngineException("AI engine not reachable at " + baseUrl, e);
        } catch (RestClientException e) {
            throw new AiEngineException("AI engine request failed: " + e.getMessage(), e);
        }

        if (response == null || !(response.get("results") instanceof List<?> rows) || rows.isEmpty()) {
            throw new AiEngineException("AI engine returned no results");
        }
        List<Finding> findings = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> r) || r.get("ruleId") == null) continue;
            findings.add(new Finding(
                    text(r.get("ruleId")),
                    Objects.requireNonNullElse(text(r.get("fieldName")), text(r.get("ruleId"))),
                    Objects.requireNonNullElse(text(r.get("status")), "REVIEW_REQUIRED"),
                    text(r.get("extractedValue")),
                    text(r.get("evidenceText")),
                    r.get("confidence") instanceof Number n ? n.doubleValue() : null,
                    box(r.get("evidenceBoundingBox")),
                    r.get("imageIndex") instanceof Number n ? n.intValue() : null));
        }
        return findings;
    }

    public Health health() {
        try {
            Map<String, Object> body = healthClient.get().uri("/health").retrieve().body(JSON_OBJECT);
            Object ocr = body == null ? null : body.get("ocr");
            return new Health(true, ocr == null ? "unknown" : ocr.toString());
        } catch (RestClientException e) {
            return new Health(false, null);
        }
    }

    public String baseUrl() { return baseUrl; }

    private static void addIfPresent(MultiValueMap<String, Object> body, String name, String value) {
        if (value != null && !value.isBlank()) body.add(name, value);
    }

    private static String text(Object v) {
        return v == null ? null : v.toString();
    }

    /** [x1, y1, x2, y2] (or an already formatted string) → "[x1,y1,x2,y2]". */
    private static String box(Object v) {
        if (v instanceof String s) return s.isBlank() ? null : s;
        if (v instanceof List<?> list && list.size() == 4 && list.stream().allMatch(Number.class::isInstance)) {
            return "[" + list.stream().map(n -> String.valueOf(((Number) n).intValue())).reduce((a, b) -> a + "," + b).orElseThrow() + "]";
        }
        return null;
    }
}

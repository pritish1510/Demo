package com.verimetrix.backend;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.verimetrix.backend.service.AiEngineException;
import com.verimetrix.backend.service.AiInspectionClient;
import com.verimetrix.backend.service.AiInspectionClient.Finding;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

/** The whole API flow the frontend drives, on in-memory H2 with a stubbed AI engine. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:verimetrix-test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.upload-dir=target/test-uploads",
})
@AutoConfigureMockMvc
class InspectionFlowIntegrationTest {

    static final AtomicBoolean ENGINE_UP = new AtomicBoolean(true);
    static final AtomicReference<AiInspectionClient.Context> LAST_CONTEXT = new AtomicReference<>();

    /** A biscuit label that is complete except for "inclusive of all taxes" next to the MRP. */
    static final List<Finding> FINDINGS = List.of(
            pass("LMPC-6-1-A-MFR", "Manufacturer / packer", "Sunrise Foods Pvt. Ltd., Pune 411026"),
            pass("LMPC-6-1-C-GENERIC", "Common / generic name", "Cream Biscuits"),
            new Finding("LMPC-6-1-D-NETQTY", "Net quantity", "PASS", "200 g", "Net Wt. 200 g", 0.93, "[10,60,136,80]", 0),
            new Finding("LMPC-6-1-E-MRP", "MRP (inclusive of taxes)", "POTENTIAL_SHORTFALL", "MRP Rs. 100",
                    "MRP Rs. 100 — 'inclusive of all taxes' not detected", 0.91, "[10,110,116,130]", 0),
            pass("LMPC-6-1-F-PKDATE", "Month and year of packing", "06/2026"),
            pass("LMPC-6-1-G-CARE", "Consumer care details", "1800-102-3344, care@sunrisefoods.in"),
            new Finding("LMPC-6-1-B-ORIGIN", "Country of origin", "NOT_APPLICABLE", null, "Not required", null, null, null),
            pass("FSSAI-LBL-LICENSE", "FSSAI licence number", "10012022000123"),
            pass("FSSAI-LBL-BEST-BEFORE", "Best before / expiry", "9 months"));

    static Finding pass(String ruleId, String name, String value) {
        return new Finding(ruleId, name, "PASS", value, value, 0.93, "[10,10,200,30]", 0);
    }

    @TestConfiguration
    static class FakeAiEngine {
        @Bean
        @Primary
        AiInspectionClient fakeAiClient() {
            return new AiInspectionClient("http://ai.invalid", 1) {
                @Override
                public List<Finding> inspect(Long id, Context ctx, List<Image> images) {
                    LAST_CONTEXT.set(ctx);
                    if (!ENGINE_UP.get()) throw new AiEngineException("AI engine not reachable at http://ai.invalid");
                    return new ArrayList<>(FINDINGS);
                }

                @Override
                public Health health() {
                    return ENGINE_UP.get() ? new Health(true, "tesseract 5.5.0") : new Health(false, null);
                }
            };
        }
    }

    @Autowired
    MockMvc mvc;

    @AfterEach
    void engineBackUp() {
        ENGINE_UP.set(true);
    }

    @Test
    void createUploadScanReviewAndReport() throws Exception {
        int id = create("Cream Biscuits", "FOOD", "INDIAN");

        mvc.perform(multipart("/api/inspections/{id}/images", id).file(png("back.png")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UPLOADED"))
                .andExpect(jsonPath("$.uploadedImages[0].id").isNumber())
                .andExpect(jsonPath("$.uploadedImages[0].imageUrl").value(startsWith("/uploads/")));

        mvc.perform(post("/api/inspections/{id}/scan", id))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PROCESSING"));

        assertEquals("REVIEW_REQUIRED", awaitScan(id));
        assertEquals(new AiInspectionClient.Context("Cream Biscuits", "FOOD", "RETAIL_PACKAGE", "INDIAN"), LAST_CONTEXT.get());

        mvc.perform(get("/api/inspections/{id}/results", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("REVIEW_REQUIRED"))
                .andExpect(jsonPath("$.results.length()").value(9))
                .andExpect(jsonPath("$.summary.pass").value(7))
                .andExpect(jsonPath("$.summary.potentialShortfall").value(1))
                .andExpect(jsonPath("$.summary.notApplicable").value(1))
                .andExpect(jsonPath("$.results[?(@.ruleId=='LMPC-6-1-E-MRP')].status").value(hasItem("POTENTIAL_SHORTFALL")))
                .andExpect(jsonPath("$.results[?(@.ruleId=='LMPC-6-1-E-MRP')].needsInspectorReview").value(hasItem(true)))
                .andExpect(jsonPath("$.results[?(@.ruleId=='LMPC-6-1-D-NETQTY')].evidenceBoundingBox").value(hasItem("[10,60,136,80]")))
                .andExpect(jsonPath("$.results[0].imageUrl").value(startsWith("/uploads/")));

        mvc.perform(patch("/api/inspections/{id}/results/{ruleId}/review", id, "LMPC-6-1-E-MRP")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"action":"EDIT","correctedValue":"MRP Rs. 100 (incl. of all taxes)","note":"Checked side panel"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.review.action").value("EDIT"))
                .andExpect(jsonPath("$.review.reviewedAt").isNotEmpty());

        mvc.perform(get("/api/inspections/{id}/results", id))
                .andExpect(jsonPath("$.results[?(@.ruleId=='LMPC-6-1-E-MRP')].review.correctedValue").value(hasItem("MRP Rs. 100 (incl. of all taxes)")));

        byte[] pdf = mvc.perform(get("/api/inspections/{id}/report/pdf", id))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/pdf"))
                .andExpect(header().string("Content-Disposition", containsString("-screening-report.pdf")))
                .andReturn().getResponse().getContentAsByteArray();
        assertEquals("%PDF", new String(pdf, 0, 4, StandardCharsets.US_ASCII));

        mvc.perform(get("/api/inspections"))
                .andExpect(jsonPath("$[?(@.id==" + id + ")].summary.pass").value(hasItem(7)));

        mvc.perform(get("/api/health"))
                .andExpect(jsonPath("$.aiEngine").value("up"))
                .andExpect(jsonPath("$.ocr").value("tesseract 5.5.0"));
    }

    @Test
    void scanStillFinishesWhenTheAiEngineIsDown() throws Exception {
        ENGINE_UP.set(false);
        int id = create("Toor Dal 1 kg", "GENERAL_PACKAGED_GOODS", "INDIAN");
        mvc.perform(multipart("/api/inspections/{id}/images", id).file(png("front.png"))).andExpect(status().isOk());
        mvc.perform(post("/api/inspections/{id}/scan", id)).andExpect(status().isAccepted());

        assertEquals("REVIEW_REQUIRED", awaitScan(id));

        mvc.perform(get("/api/inspections/{id}/results", id))
                .andExpect(jsonPath("$.results.length()").value(7)) // no FSSAI rules outside food
                .andExpect(jsonPath("$.summary.reviewRequired").value(6))
                .andExpect(jsonPath("$.summary.notApplicable").value(1))
                .andExpect(jsonPath("$.results[?(@.status=='REVIEW_REQUIRED')].evidenceText").value(everyItem(startsWith("AI engine not reachable"))));

        mvc.perform(get("/api/health"))
                .andExpect(jsonPath("$.aiEngine").value("down"))
                .andExpect(jsonPath("$.ocr").value("unavailable"));
    }

    @Test
    void errorsComeBackAsMessages() throws Exception {
        mvc.perform(get("/api/inspections/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Inspection not found"));

        mvc.perform(post("/api/inspections").contentType(MediaType.APPLICATION_JSON).content("{\"productName\":\" \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("productName and category are required"));

        int id = create("Toor Dal 1 kg", "GENERAL_PACKAGED_GOODS", "INDIAN");

        mvc.perform(post("/api/inspections/{id}/scan", id))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Upload at least one image before scanning"));

        mvc.perform(get("/api/inspections/{id}/results", id))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Results are not ready yet"));

        mvc.perform(multipart("/api/inspections/{id}/images", id)
                        .file(new MockMultipartFile("files", "label.svg", "image/svg+xml", "<svg/>".getBytes())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(startsWith("Only JPG, PNG")));

        mvc.perform(patch("/api/inspections/{id}/results/{ruleId}/review", id, "NOPE")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"CONFIRM\"}"))
                .andExpect(status().isNotFound());
    }

    private int create(String productName, String category, String originType) throws Exception {
        String body = mvc.perform(post("/api/inspections").contentType(MediaType.APPLICATION_JSON).content("""
                        {"productName":"%s","category":"%s","contextType":"RETAIL_PACKAGE","originType":"%s"}"""
                        .formatted(productName, category, originType)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andExpect(jsonPath("$.inspectionCode").value(startsWith("INS-")))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private String awaitScan(int id) throws Exception {
        for (int i = 0; i < 100; i++) {
            String body = mvc.perform(get("/api/inspections/{id}", id)).andReturn().getResponse().getContentAsString();
            String s = JsonPath.read(body, "$.status");
            if (!"PROCESSING".equals(s)) return s;
            Thread.sleep(50);
        }
        throw new AssertionError("Scan did not finish");
    }

    private static MockMultipartFile png(String name) {
        return new MockMultipartFile("files", name, "image/png", new byte[]{(byte) 0x89, 'P', 'N', 'G'});
    }
}

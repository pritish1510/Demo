package com.verimetrix.backend.service;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import com.verimetrix.backend.service.AiInspectionClient.Context;
import com.verimetrix.backend.service.AiInspectionClient.Finding;
import com.verimetrix.backend.service.AiInspectionClient.Image;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The real HTTP client against a stand-in AI engine: multipart request out, findings back. */
class AiInspectionClientTest {
    static final String RESPONSE = """
            {"status":"REVIEW_REQUIRED","results":[
              {"ruleId":"LMPC-6-1-D-NETQTY","fieldName":"Net quantity","status":"PASS","extractedValue":"200 g",
               "evidenceText":"NET WEIGHT 200 g","confidence":0.94,"evidenceBoundingBox":[188,623,316,701],"imageIndex":0,
               "needsInspectorReview":false},
              {"ruleId":"LMPC-6-1-B-ORIGIN","fieldName":"Country of origin","status":"NOT_APPLICABLE","extractedValue":null,
               "evidenceText":"Not required","confidence":null,"evidenceBoundingBox":null,"imageIndex":null}
            ]}""";

    HttpServer server;
    final AtomicReference<String> request = new AtomicReference<>();
    final AtomicReference<String> contentType = new AtomicReference<>();

    @TempDir
    Path dir;

    @BeforeEach
    void startEngine() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ai/inspect", ex -> {
            contentType.set(ex.getRequestHeaders().getFirst("Content-Type"));
            request.set(new String(ex.getRequestBody().readAllBytes(), UTF_8));
            byte[] body = RESPONSE.getBytes(UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
        });
        server.createContext("/health", ex -> {
            byte[] body = "{\"status\":\"running\",\"ocr\":\"tesseract 5.5.0\"}".getBytes(UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
        });
        server.start();
    }

    @AfterEach
    void stopEngine() {
        server.stop(0);
    }

    private String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @Test
    void sendsImagesWithProductDetailsAndParsesFindings() throws IOException {
        Path image = Files.write(dir.resolve("stored-uuid.png"), new byte[]{(byte) 0x89, 'P', 'N', 'G'});
        AiInspectionClient client = new AiInspectionClient(url() + "/", 5);

        List<Finding> findings = client.inspect(7L, new Context("Parle-G Biscuits", "FOOD", "RETAIL_PACKAGE", "INDIAN"),
                List.of(new Image(image, "back.png")));

        assertTrue(contentType.get().startsWith("multipart/form-data"), contentType.get());
        String body = request.get();
        assertTrue(body.contains("name=\"inspectionId\"") && body.contains("\r\n7\r\n"), body);
        assertTrue(body.contains("name=\"category\"") && body.contains("FOOD"), body);
        assertTrue(body.contains("name=\"originType\"") && body.contains("INDIAN"), body);
        assertTrue(body.contains("name=\"productName\"") && body.contains("Parle-G Biscuits"), body);
        assertTrue(body.contains("name=\"files\"; filename=\"back.png\""), body);

        assertEquals(List.of(
                new Finding("LMPC-6-1-D-NETQTY", "Net quantity", "PASS", "200 g", "NET WEIGHT 200 g", 0.94, "[188,623,316,701]", 0),
                new Finding("LMPC-6-1-B-ORIGIN", "Country of origin", "NOT_APPLICABLE", null, "Not required", null, null, null)),
                findings);
    }

    @Test
    void reportsHealth() {
        assertEquals(new AiInspectionClient.Health(true, "tesseract 5.5.0"), new AiInspectionClient(url(), 5).health());
    }

    @Test
    void unreachableEngineIsAnAiEngineException() {
        AiInspectionClient client = new AiInspectionClient("http://127.0.0.1:1", 5);
        AiEngineException e = assertThrows(AiEngineException.class,
                () -> client.inspect(1L, new Context("x", "FOOD", null, null), List.of()));
        assertTrue(e.getMessage().startsWith("AI engine not reachable at http://127.0.0.1:1"), e.getMessage());
        assertFalse(client.health().reachable());
    }
}

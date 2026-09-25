package com.verimetrix.backend.controller;

import com.verimetrix.backend.service.AiInspectionClient;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final AiInspectionClient ai;

    public HealthController(AiInspectionClient ai) {
        this.ai = ai;
    }

    @GetMapping("/")
    public Map<String, Object> home() {
        return Map.of("application", "VeriMetrix", "status", "running");
    }

    /** {status, aiEngine: up|down, ocr: "tesseract x.y" | "unavailable"} — shown by the frontend's Settings page. */
    @GetMapping("/api/health")
    public Map<String, String> health() {
        AiInspectionClient.Health engine = ai.health();
        return Map.of(
                "status", "UP",
                "aiEngine", engine.reachable() ? "up" : "down",
                "aiEngineUrl", ai.baseUrl(),
                "ocr", engine.reachable() && engine.ocr() != null ? engine.ocr() : "unavailable");
    }
}

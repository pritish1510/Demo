package com.verimetrix.backend.service;

import com.verimetrix.backend.controller.ApiException;
import com.verimetrix.backend.model.Inspection;
import com.verimetrix.backend.model.InspectionImage;
import com.verimetrix.backend.model.RuleResult;
import com.verimetrix.backend.repo.InspectionRepository;
import com.verimetrix.backend.service.AiInspectionClient.Context;
import com.verimetrix.backend.service.AiInspectionClient.Finding;
import jakarta.annotation.PreDestroy;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs a scan in the background: PROCESSING → AI engine (OCR + rules) → COMPLETED (everything
 * passed) / REVIEW_REQUIRED, or FAILED on an unexpected error. If the AI engine can't be reached,
 * every rule comes back Review Required with the reason, so the inspector can still check by hand.
 * The frontend polls GET /api/inspections/{id} until the status is terminal.
 */
@Service
public class ScanService {
    private static final Logger log = LoggerFactory.getLogger(ScanService.class);

    static final String PASS = "PASS";
    static final String REVIEW_REQUIRED = "REVIEW_REQUIRED";
    static final String NOT_APPLICABLE = "NOT_APPLICABLE";

    // The rules the AI engine checks (ai-engine/app/rules.py). Only used to report a scan when the engine is down.
    private static final List<String[]> STANDARD_RULES = List.of(
            new String[]{"LMPC-6-1-A-MFR", "Manufacturer / packer"},
            new String[]{"LMPC-6-1-C-GENERIC", "Common / generic name"},
            new String[]{"LMPC-6-1-D-NETQTY", "Net quantity"},
            new String[]{"LMPC-6-1-E-MRP", "MRP (inclusive of taxes)"},
            new String[]{"LMPC-6-1-F-PKDATE", "Month and year of packing"},
            new String[]{"LMPC-6-1-G-CARE", "Consumer care details"},
            new String[]{"LMPC-6-1-B-ORIGIN", "Country of origin"});
    private static final List<String[]> FOOD_RULES = List.of(
            new String[]{"FSSAI-LBL-LICENSE", "FSSAI licence number"},
            new String[]{"FSSAI-LBL-BEST-BEFORE", "Best before / expiry"});

    private final InspectionRepository inspections;
    private final AiInspectionClient ai;
    private final TransactionTemplate tx;
    private final Path uploadRoot;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public ScanService(InspectionRepository inspections, AiInspectionClient ai,
                       PlatformTransactionManager txManager, @Value("${app.upload-dir:uploads}") String uploadDir) {
        this.inspections = inspections;
        this.ai = ai;
        this.tx = new TransactionTemplate(txManager);
        this.uploadRoot = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    /** A scan cut off by a restart would otherwise stay PROCESSING forever; FAILED lets the inspector rerun it. */
    @EventListener(ApplicationReadyEvent.class)
    public void failInterruptedScans() {
        tx.executeWithoutResult(s -> inspections.findByStatus("PROCESSING").forEach(i -> {
            log.warn("Inspection {} was PROCESSING at startup; marking FAILED", i.getInspectionCode());
            i.setStatus("FAILED");
        }));
    }

    /** Marks the inspection PROCESSING (committed before returning) and screens it in the background. */
    public String start(Long id) {
        tx.executeWithoutResult(s -> {
            Inspection i = require(id);
            if (i.getImages().isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Upload at least one image before scanning");
            if ("PROCESSING".equals(i.getStatus())) throw new ApiException(HttpStatus.CONFLICT, "A scan is already running for this inspection");
            i.getResults().clear();
            i.setStatus("PROCESSING");
        });
        executor.submit(() -> run(id));
        return "PROCESSING";
    }

    private void run(Long id) {
        record Input(Context ctx, List<AiInspectionClient.Image> images) {}
        try {
            Input in = tx.execute(s -> {
                Inspection i = require(id);
                return new Input(
                        new Context(i.getProductName(), i.getCategory(), i.getContextType(), i.getOriginType()),
                        i.getImages().stream()
                                .map(img -> new AiInspectionClient.Image(uploadRoot.resolve(img.getStoredName()), img.getFileName()))
                                .toList());
            });
            List<Finding> findings = screen(id, in.ctx(), in.images());
            tx.executeWithoutResult(s -> save(require(id), findings));
        } catch (Throwable e) {
            // Catch everything: an escaped Error would vanish inside the executor and leave the scan PROCESSING forever.
            log.error("Scan failed for inspection {}", id, e);
            tx.executeWithoutResult(s -> inspections.findById(id).ifPresent(i -> i.setStatus("FAILED")));
            if (e instanceof VirtualMachineError fatal) throw fatal;
        }
    }

    private List<Finding> screen(Long id, Context ctx, List<AiInspectionClient.Image> images) {
        try {
            return ai.inspect(id, ctx, images);
        } catch (AiEngineException e) {
            log.warn("Inspection {}: {}", id, e.getMessage());
            return engineUnavailable(ctx, e.getMessage() + " — the label was not read. "
                    + "Start the AI engine and scan again, or verify this declaration on the package image.");
        }
    }

    static List<Finding> engineUnavailable(Context ctx, String reason) {
        List<String[]> rules = new ArrayList<>(STANDARD_RULES);
        if ("FOOD".equals(ctx.category()) || "BEVERAGES".equals(ctx.category())) rules.addAll(FOOD_RULES);
        return rules.stream().map(r -> "LMPC-6-1-B-ORIGIN".equals(r[0]) && "INDIAN".equals(ctx.originType())
                ? new Finding(r[0], r[1], NOT_APPLICABLE, null, "Not required — product declared as Indian origin", null, null, null)
                : new Finding(r[0], r[1], REVIEW_REQUIRED, null, reason, null, null, null)).toList();
    }

    private void save(Inspection i, List<Finding> findings) {
        List<InspectionImage> images = i.getImages();
        i.getResults().clear();
        for (Finding f : findings) {
            RuleResult r = new RuleResult();
            r.setInspection(i);
            boolean notApplicable = NOT_APPLICABLE.equals(f.status());
            // Findings without a located region still point at the first image so the inspector can check it.
            if (!notApplicable && !images.isEmpty()) {
                int index = f.imageIndex() == null ? 0 : Math.clamp(f.imageIndex(), 0, images.size() - 1);
                r.setImage(images.get(index));
            }
            r.setRuleId(f.ruleId());
            r.setFieldName(f.fieldName());
            r.setStatus(f.status());
            r.setExtractedValue(f.extractedValue());
            r.setEvidenceText(f.evidenceText());
            r.setConfidence(f.confidence());
            r.setEvidenceBoundingBox(f.boundingBox());
            r.setNeedsInspectorReview(!notApplicable && !PASS.equals(f.status()));
            i.getResults().add(r);
        }
        boolean clean = findings.stream().allMatch(f -> PASS.equals(f.status()) || NOT_APPLICABLE.equals(f.status()));
        i.setStatus(clean ? "COMPLETED" : "REVIEW_REQUIRED");
    }

    private Inspection require(Long id) {
        return inspections.findById(id).orElseThrow(() -> new NoSuchElementException("Inspection not found"));
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}

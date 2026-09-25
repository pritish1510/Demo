package com.verimetrix.backend.controller;

import com.verimetrix.backend.dto.InspectionMapper;
import com.verimetrix.backend.model.Inspection;
import com.verimetrix.backend.model.InspectionImage;
import com.verimetrix.backend.model.RuleResult;
import com.verimetrix.backend.repo.InspectionRepository;
import com.verimetrix.backend.repo.RuleResultRepository;
import com.verimetrix.backend.service.ReportPdfService;
import com.verimetrix.backend.service.ScanService;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/inspections")
@Transactional
public class InspectionController {
    // Formats Tesseract can read. SVG is refused: OCR can't read it and it can carry scripts.
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif");
    private static final Set<String> REVIEW_ACTIONS = Set.of("CONFIRM", "EDIT", "MARK_INCORRECT");
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;

    private final InspectionRepository inspections;
    private final RuleResultRepository results;
    private final ScanService scans;
    private final ReportPdfService reports;
    private final Path uploadRoot;

    public InspectionController(InspectionRepository inspections, RuleResultRepository results, ScanService scans,
                                ReportPdfService reports, @Value("${app.upload-dir:uploads}") String uploadDir) {
        this.inspections = inspections;
        this.results = results;
        this.scans = scans;
        this.reports = reports;
        this.uploadRoot = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return inspections.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream().map(InspectionMapper::inspection).toList();
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, String> body) {
        String name = Objects.requireNonNullElse(body.get("productName"), "").strip();
        String category = Objects.requireNonNullElse(body.get("category"), "").strip();
        if (name.isEmpty() || category.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "productName and category are required");
        Inspection i = new Inspection();
        i.setInspectionCode("INS-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT));
        i.setProductName(name);
        i.setCategory(category);
        i.setContextType(blankToNull(body.get("contextType")));
        i.setOriginType(blankToNull(body.get("originType")));
        return ResponseEntity.status(HttpStatus.CREATED).body(InspectionMapper.inspection(inspections.save(i)));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        return InspectionMapper.inspection(require(id));
    }

    @PostMapping(value = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@PathVariable Long id, @RequestParam("files") List<MultipartFile> files) throws IOException {
        if (files.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "At least one image is required");
        Inspection i = require(id);
        if ("PROCESSING".equals(i.getStatus())) throw new ApiException(HttpStatus.CONFLICT, "A scan is running — wait for it to finish before adding images");
        // Validate everything first so a bad file doesn't leave half an upload behind.
        for (MultipartFile f : files) {
            String type = f.getContentType() == null ? "" : f.getContentType().toLowerCase(Locale.ROOT);
            if (f.isEmpty() || !IMAGE_TYPES.contains(type)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, WebP, BMP, TIFF or GIF images are accepted (" + f.getOriginalFilename() + ")");
            }
            if (f.getSize() > MAX_IMAGE_BYTES) throw new ApiException(HttpStatus.BAD_REQUEST, "Each image must be 10 MB or smaller");
        }
        Files.createDirectories(uploadRoot);
        List<InspectionImage> added = new ArrayList<>();
        for (MultipartFile f : files) {
            String stored = UUID.randomUUID() + extension(f.getOriginalFilename());
            try (InputStream in = f.getInputStream()) {
                Files.copy(in, uploadRoot.resolve(stored));
            }
            InspectionImage image = new InspectionImage();
            image.setInspection(i);
            image.setFileName(Objects.requireNonNullElse(f.getOriginalFilename(), "package-image"));
            image.setStoredName(stored);
            i.getImages().add(image);
            added.add(image);
        }
        i.setStatus("UPLOADED");
        // i is managed, so flush() persists the new images in place and assigns their ids.
        // save() would merge() instead, which persists copies and leaves these objects without ids.
        inspections.flush();
        return Map.of("inspectionId", i.getId(), "uploadedImages", added.stream().map(InspectionMapper::image).toList(), "status", i.getStatus());
    }

    /** Returns immediately with PROCESSING; the frontend polls GET /{id} until COMPLETED / REVIEW_REQUIRED / FAILED. */
    @PostMapping("/{id}/scan")
    @Transactional(Transactional.TxType.NOT_SUPPORTED) // ScanService commits PROCESSING itself before the background job reads it
    public ResponseEntity<Map<String, Object>> scan(@PathVariable Long id) {
        return ResponseEntity.accepted().body(Map.of("inspectionId", id, "status", scans.start(id)));
    }

    @GetMapping("/{id}/results")
    public Map<String, Object> results(@PathVariable Long id) {
        Inspection i = require(id);
        if (i.getResults().isEmpty()) throw new ApiException(HttpStatus.CONFLICT, "Results are not ready yet");
        return InspectionMapper.results(i);
    }

    @PatchMapping("/{id}/results/{ruleId}/review")
    public Map<String, Object> review(@PathVariable Long id, @PathVariable String ruleId, @RequestBody Map<String, String> body) {
        RuleResult r = results.findByInspectionIdAndRuleId(id, ruleId).orElseThrow(() -> new NoSuchElementException("Rule result not found"));
        String action = body.get("action");
        if (action == null || !REVIEW_ACTIONS.contains(action)) throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid review action");
        String corrected = blankToNull(body.get("correctedValue"));
        if ("EDIT".equals(action) && corrected == null) throw new ApiException(HttpStatus.BAD_REQUEST, "correctedValue is required for EDIT");
        r.setReviewAction(action);
        r.setCorrectedValue("EDIT".equals(action) ? corrected : null);
        r.setReviewNote(blankToNull(body.get("note")));
        r.setReviewedBy("Inspector");
        r.setReviewedAt(Instant.now());
        return Map.of("ruleId", ruleId, "review", InspectionMapper.review(r));
    }

    @GetMapping("/{id}/report/pdf")
    public ResponseEntity<byte[]> reportPdf(@PathVariable Long id) {
        Inspection i = require(id);
        if (i.getResults().isEmpty()) throw new ApiException(HttpStatus.CONFLICT, "Results are not ready yet");
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(i.getInspectionCode() + "-screening-report.pdf").build().toString())
                .body(reports.render(i));
    }

    private Inspection require(Long id) {
        return inspections.findById(id).orElseThrow(() -> new NoSuchElementException("Inspection not found"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String extension(String name) {
        if (name == null) return ".jpg";
        int p = name.lastIndexOf('.');
        return p < 0 ? ".jpg" : name.substring(p).replaceAll("[^A-Za-z0-9.]", "");
    }
}

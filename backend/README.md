# VeriMetrix Backend

Spring Boot 4 (Java 25) REST API: inspections, image uploads, scans (delegated to the AI engine in `../ai-engine`), inspector reviews and the PDF report. See the [root README](../README.md) for the whole project.

1. **Database** — either
   - MySQL: the defaults connect to `verimetrix_db` on `127.0.0.1:3306` as `springstudent` / `springstudent` and create the database if it's missing. Override with `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`; or
   - H2 (no install): run with the `h2` profile (`SPRING_PROFILES_ACTIVE=h2`); data is stored in `data/`.
2. **AI engine** — start it on `http://localhost:8000` (or set `AI_ENGINE_URL`). Without it, scans still finish but every rule is marked Review Required.
3. **Run** — `./mvnw spring-boot:run`, or run `VerimetrixBackendApplication` from IntelliJ.
4. Open http://localhost:8080/api/health → `{"status":"UP","aiEngine":"up","ocr":"tesseract 5.5.0",...}`

Tests: `./mvnw test`

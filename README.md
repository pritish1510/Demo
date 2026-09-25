# VeriMetrix

Packaging-compliance screening. An inspector photographs a package, the AI engine reads the label with OCR and checks the mandatory declarations of the Legal Metrology (Packaged Commodities) Rules, 2011, and the inspector reviews each evidence-based finding before issuing a report.

**Flow:** Dashboard → New Inspection → Upload images → Scan (OCR + rules) → Results with highlighted evidence → Confirm / Edit / Mark incorrect → Report (print, PDF, CSV)

```
verimetrix/
├── frontend/    React 19 + Vite + Tailwind — the inspector dashboard          :5173
├── backend/     Spring Boot 4 (Java 25) + JPA — REST API, storage, PDF report  :8080
├── ai-engine/   Python FastAPI — OCR (Tesseract) + labelling rules             :8000
└── dev.sh       starts all three
```

```
browser ──/api, /uploads──▶ backend ──POST /ai/inspect (images + product details)──▶ ai-engine
                             │  saves findings, serves results, reviews, PDF          │  OCR → rules → findings
                             └── MySQL (or H2)                                         └── Tesseract
```

## Prerequisites

| Tool | Needed for | Install |
| --- | --- | --- |
| JDK 25 | backend | [adoptium.net](https://adoptium.net) (or IntelliJ's bundled JDK) |
| Node.js 20+ | frontend | [nodejs.org](https://nodejs.org) |
| Python 3.10+ | AI engine | `brew install python@3.12` / [python.org](https://www.python.org/downloads/) |
| Tesseract OCR | AI engine — reading label text | `brew install tesseract` / `sudo apt install tesseract-ocr` / [Windows installer](https://github.com/UB-Mannheim/tesseract/wiki) |
| MySQL 8 | backend database (optional — see `h2` below) | [dev.mysql.com](https://dev.mysql.com/downloads/) |

Maven is not required; the backend ships with the Maven wrapper (`./mvnw`).

One-time AI engine setup:

```bash
cd ai-engine && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Without the AI engine (or without Tesseract) everything still runs, but scans can't read labels, so every rule comes back *Review Required* with a note saying why. **Settings → Test connection** shows the AI engine and OCR status.

## Run

```bash
./dev.sh        # AI engine + backend on MySQL + frontend
./dev.sh h2     # same, with the backend on an embedded H2 database (no MySQL needed)
```

Then open http://localhost:5173. Ctrl+C stops everything.

Or run them separately:

```bash
cd ai-engine && .venv/bin/uvicorn app.main:app --port 8000        # Windows: .venv\Scripts\uvicorn ...
cd backend && ./mvnw spring-boot:run                               # MySQL
cd backend && SPRING_PROFILES_ACTIVE=h2 ./mvnw spring-boot:run     # H2, data in backend/data/
cd frontend && npm install && npm run dev
```

In IntelliJ, run `VerimetrixBackendApplication` (add `h2` under *Active profiles* to skip MySQL).

### How they connect

In development the Vite dev server proxies `/api` and `/uploads` to the backend on `:8080`, so the browser only talks to `localhost:5173` — no CORS setup. When a scan starts, the backend sends the stored images and the product details (category, origin, product name) to the AI engine and saves the findings it returns; the browser never calls the AI engine directly.

For a deployment, serve `frontend/dist` (`npm run build`) behind the same reverse proxy as the API, or set `VITE_API_BASE_URL` at build time and add the site's origin to `CORS_ORIGINS`. Point the backend at the AI engine with `AI_ENGINE_URL`.

If the UI shows sample inspections you didn't create, it is on **Demo data** (remembered per browser) — switch to **Live API** in **Settings**.

## Configuration

Backend (environment variables; defaults in `backend/src/main/resources/application.properties`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_URL` | `jdbc:mysql://127.0.0.1:3306/verimetrix_db?createDatabaseIfNotExist=true…` | JDBC URL |
| `DB_USERNAME` / `DB_PASSWORD` | `springstudent` / `springstudent` | MySQL credentials |
| `SPRING_PROFILES_ACTIVE` | — | `h2` for the embedded database |
| `PORT` | `8080` | HTTP port |
| `UPLOAD_DIR` | `uploads` | Where package images are stored |
| `AI_ENGINE_URL` | `http://localhost:8000` | The AI engine |
| `AI_TIMEOUT_SECONDS` | `180` | How long a scan may wait for the AI engine |
| `CORS_ORIGINS` | `http://localhost:[*],http://127.0.0.1:[*]` | Origin patterns allowed to call the API directly (`[*]` = any port); set your site's origin in production |

AI engine: `TESSERACT_CMD` (path to `tesseract` if it isn't on the PATH), `OCR_LANG` (default `eng`, e.g. `eng+hin`), `OCR_TARGET_LONG_SIDE` (default `3000` px; small images are upscaled to this).

Frontend (`frontend/.env`): `VITE_USE_MOCK` (`true` = demo data), `VITE_API_BASE_URL` (empty = dev proxy), `VITE_PROXY_TARGET` (default `http://localhost:8080`).

## What a scan checks

The AI engine ([`ai-engine/app`](ai-engine/app)) preprocesses each image (upscale, contrast, adaptive threshold), runs three Tesseract passes, and applies the rules in [`rules.py`](ai-engine/app/rules.py) to each pass, keeping the most complete reading per rule. Values laid out beside or below their heading — as on most labels ("NET WEIGHT:" with "200 g" underneath) — are matched by position on the image. Every finding carries the extracted value, the OCR confidence, and the bounding box of the evidence, which the Results page zooms to.

| Rule | Declaration | Applies to |
| --- | --- | --- |
| `LMPC-6-1-A-MFR` | Manufacturer / packer / importer name and address (with PIN code) | all |
| `LMPC-6-1-C-GENERIC` | Common or generic name | all |
| `LMPC-6-1-D-NETQTY` | Net quantity in standard units (flags `gms`, `ltr`, `kgs`, …) | all |
| `LMPC-6-1-E-MRP` | MRP, inclusive of all taxes | all |
| `LMPC-6-1-F-PKDATE` | Month and year of packing / manufacture | all |
| `LMPC-6-1-G-CARE` | Consumer care telephone and e-mail | all |
| `LMPC-6-1-B-ORIGIN` | Country of origin | imported / unknown origin |
| `FSSAI-LBL-LICENSE` | 14-digit FSSAI licence number | food, beverages |
| `FSSAI-LBL-BEST-BEFORE` | Best before / use by / expiry | food, beverages |

| Result | Meaning |
| --- | --- |
| Pass | Declaration found and looks complete |
| Potential Shortfall | Found, but something required appears missing (e.g. no PIN code, no "incl. of all taxes") |
| Review Required | Not found or not legible — OCR can miss text, so absence is never treated as proof |
| Low Confidence | Would pass, but OCR confidence is below 60 % |
| Not Applicable | Rule doesn't apply (e.g. country of origin for an Indian product) |

These are screening flags for an inspector, not legal determinations; the UI and PDF wording follow that rule.

## API

Backend (what the frontend calls):

| Method | Path | |
| --- | --- | --- |
| GET | `/api/inspections` | List, newest first |
| POST | `/api/inspections` | Create `{productName, category, contextType, originType}` |
| GET | `/api/inspections/{id}` | Inspection + images + summary (polled during a scan) |
| POST | `/api/inspections/{id}/images` | Multipart `files` (JPG, PNG, WebP, BMP, TIFF, GIF; ≤ 10 MB each) |
| POST | `/api/inspections/{id}/scan` | Start a background scan → `PROCESSING` |
| GET | `/api/inspections/{id}/results` | Rule-wise findings |
| PATCH | `/api/inspections/{id}/results/{ruleId}/review` | `{action: CONFIRM \| EDIT \| MARK_INCORRECT, correctedValue, note}` |
| GET | `/api/inspections/{id}/report/pdf` | PDF report |
| GET | `/api/health` | `{status, aiEngine: up\|down, aiEngineUrl, ocr}` |

Errors are always `{"message": "..."}`. The AI engine's own API is described in [`ai-engine/README.md`](ai-engine/README.md).

## Tests

```bash
cd backend && ./mvnw test                              # API flow against H2 with a stubbed AI engine
cd ai-engine && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest
```

The AI engine tests cover every rule on synthetic OCR output, the HTTP contract the backend relies on, and — when Tesseract is installed — a real OCR run on the Parle-G label in `ai-engine/test.png`.
#   D e m o  
 #   D e m o  
 
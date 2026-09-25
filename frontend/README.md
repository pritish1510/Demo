# VeriMetrix — Frontend

React dashboard for packaging-compliance screening. Inspectors upload package photos, the backend runs OCR + rule checks, and the inspector reviews each evidence-based finding before issuing a report.

**Flow:** Dashboard → New Inspection → Upload images → Scan → Results → Review/Edit → Report

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

The app talks to the backend in [`../backend`](../backend) through the Vite dev proxy — start that first (or run `../dev.sh` to start both). **Demo data** (built-in sample inspections, stored in the browser) can be switched on from **Settings** to use the UI without a backend.

| Env var | Purpose |
| --- | --- |
| `VITE_USE_MOCK` | `true` to start on demo data instead of the live API |
| `VITE_API_BASE_URL` | Backend URL. Leave empty to use the dev proxy (no CORS setup needed) |
| `VITE_PROXY_TARGET` | Where the dev server proxies `/api` and `/uploads` (default `http://localhost:8080`) |

Demo tip: on **New Inspection**, click **Use sample product** to fill the form and attach a sample label.

## Stack

React 19 · React Router · Axios · Tailwind CSS v4 · Lucide icons · Recharts · React Dropzone

## Structure

```
src/
├── components/   Sidebar, Navbar, StatCard, StatusBadge, ImageUploader,
│                 EvidenceViewer, RuleResultTable, ReviewPanel, …
├── pages/        Dashboard, NewInspection, ScanProgress, InspectionResults,
│                 InspectionHistory (also /reports), Report, Settings
├── services/     inspectionApi.js  ← the only file that talks to the backend
│                 mockBackend.js / mockData.js  ← demo data, same shape as the contract
└── utils/        statusUtils.js (labels + colours), format.js, csv.js
```

## API contract

The frontend uses the agreed contract field names as-is. `inspectionApi.js` normalizes small variations, such as confidence given as `0.96` or `96`, the bounding box as a string or an array, and a paged `{content: []}` list.

All endpoints are implemented by the backend.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/inspections` | Dashboard + History list, newest first, with `summary` per item |
| POST | `/api/inspections` | Create; body `{ productName, category, contextType, originType }` |
| POST | `/api/inspections/{id}/images` | Multipart, field name `files` |
| POST | `/api/inspections/{id}/scan` | Returns `PROCESSING` immediately; OCR runs in the background |
| GET | `/api/inspections/{id}` | Polled every 1.5 s until `COMPLETED` / `REVIEW_REQUIRED` (`FAILED` shows retry) |
| GET | `/api/inspections/{id}/results` | Rule-wise findings with evidence box, image and saved review |
| PATCH | `/api/inspections/{id}/results/{ruleId}/review` | Body `{ action: "CONFIRM" \| "EDIT" \| "MARK_INCORRECT", correctedValue, note }` |
| GET | `/api/inspections/{id}/report/pdf` | Server-generated PDF ("Download PDF") |

- `evidenceBoundingBox` is `[x1, y1, x2, y2]` in **pixels of the original uploaded image**; each result carries the `imageUrl` it refers to.
- Result statuses: `PASS`, `POTENTIAL_SHORTFALL`, `REVIEW_REQUIRED`, `LOW_CONFIDENCE`, `NOT_APPLICABLE`.

## Wording rule

The UI never says the AI "confirmed a violation". It uses *Potential Shortfall*, *Requires Inspector Review*, *AI Screening Result*, and *Evidence-Based Finding*. Keep it that way.

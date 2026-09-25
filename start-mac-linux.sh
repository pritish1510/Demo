#!/usr/bin/env bash
# VeriMetrix - one-click local run (macOS / Linux)
#   ./start-mac-linux.sh          backend on embedded H2 (no MySQL needed)
#   ./start-mac-linux.sh mysql    backend on MySQL (verimetrix_db)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

command -v java >/dev/null || { echo "[X] Java 25 required: https://adoptium.net"; exit 1; }
command -v npm  >/dev/null || { echo "[X] Node.js 20+ required: https://nodejs.org"; exit 1; }

if [ "${1:-h2}" = "mysql" ]; then
  unset SPRING_PROFILES_ACTIVE
  echo "[i] Backend will use MySQL (verimetrix_db)"
else
  export SPRING_PROFILES_ACTIVE=h2
  echo "[i] Backend will use the embedded H2 database (no MySQL needed)"
fi

[ -f frontend/.env ] || cp frontend/.env.example frontend/.env

trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT

# ---- AI engine (optional) ----
if [ ! -x ai-engine/.venv/bin/uvicorn ]; then
  if command -v python3 >/dev/null; then
    echo "[1/3] Setting up the AI engine (one time, ~1-2 min)..."
    (cd ai-engine && python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r requirements.txt)
  else
    echo '[!] Python 3.10+ not found - skipping AI engine (scans will come back "Review Required").'
  fi
fi
if [ -x ai-engine/.venv/bin/uvicorn ]; then
  command -v tesseract >/dev/null || echo "[!] Tesseract OCR not found - install it to read labels: brew install tesseract / sudo apt install tesseract-ocr"
  (cd ai-engine && .venv/bin/uvicorn app.main:app --port 8000) &
fi

# ---- backend ----
echo "[2/3] Backend  -> http://localhost:8080"
chmod +x backend/mvnw 2>/dev/null
(cd backend && ./mvnw -q spring-boot:run) &

# ---- frontend ----
echo "[3/3] Frontend -> http://localhost:5173"
cd frontend
[ -d node_modules ] || { echo "    installing npm packages (one time)..."; npm install; }
npm run dev &

echo
echo "Open http://localhost:5173  (backend needs ~30-60s on the first run). Ctrl+C stops everything."
wait

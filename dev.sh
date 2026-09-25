#!/usr/bin/env bash
# Start the AI engine (http://localhost:8000), backend (http://localhost:8080) and frontend
# (http://localhost:5173) together. Ctrl+C stops all three.
#   ./dev.sh       backend on MySQL (backend/src/main/resources/application.properties)
#   ./dev.sh h2    backend on the embedded H2 database — no MySQL needed
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "h2" ]; then export SPRING_PROFILES_ACTIVE=h2; fi

command -v java >/dev/null || { echo "Java 25 is required (https://adoptium.net)."; exit 1; }
command -v npm >/dev/null || { echo "Node.js 20+ is required (https://nodejs.org)."; exit 1; }

# Stop everything this script started (including the JVM forked by spring-boot:run) on exit.
trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT

if [ -x "$ROOT/ai-engine/.venv/bin/uvicorn" ]; then
  command -v tesseract >/dev/null || [ -n "${TESSERACT_CMD:-}" ] \
    || echo "⚠  Tesseract not found — the AI engine can't read labels. Install: brew install tesseract"
  (cd "$ROOT/ai-engine" && .venv/bin/uvicorn app.main:app --port 8000) &
else
  echo "⚠  AI engine not set up, so scans will need manual review. Set it up once (Python 3.10+):"
  echo "     cd ai-engine && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
fi

(cd "$ROOT/backend" && ./mvnw -q spring-boot:run) &

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev &

wait

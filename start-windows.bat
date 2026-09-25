@echo off
REM ===============================================================
REM  VeriMetrix - one-click local run (Windows)
REM  Starts: AI engine :8000, backend :8080 (H2), frontend :5173
REM  Usage:  double-click this file, or  start-windows.bat mysql
REM ===============================================================
setlocal
cd /d "%~dp0"

where java >nul 2>&1 || (echo [X] Java 25 not found. Install from https://adoptium.net & pause & exit /b 1)
where npm  >nul 2>&1 || (echo [X] Node.js 20+ not found. Install from https://nodejs.org & pause & exit /b 1)

REM ---- database profile: H2 by default (no MySQL needed) --------
set DBMODE=%1
if "%DBMODE%"=="mysql" (
  set "SPRING_PROFILES_ACTIVE="
  echo [i] Backend will use MySQL ^(verimetrix_db^)
) else (
  set SPRING_PROFILES_ACTIVE=h2
  echo [i] Backend will use the embedded H2 database ^(no MySQL needed^)
)

REM ---- frontend .env -------------------------------------------
if not exist "frontend\.env" copy "frontend\.env.example" "frontend\.env" >nul

REM ---- AI engine (optional, needs Python + Tesseract) ----------
if not exist "ai-engine\.venv\Scripts\uvicorn.exe" (
  where python >nul 2>&1 && (
    echo [1/3] Setting up the AI engine ^(one time, ~1-2 min^)...
    pushd ai-engine
    python -m venv .venv
    .venv\Scripts\python -m pip install -q --upgrade pip
    .venv\Scripts\pip install -q -r requirements.txt
    popd
  ) || echo [!] Python not found - skipping AI engine ^(scans will say "Review Required"^).
)
if exist "ai-engine\.venv\Scripts\uvicorn.exe" (
  where tesseract >nul 2>&1 || echo [!] Tesseract OCR not found - install it to read labels: https://github.com/UB-Mannheim/tesseract/wiki
  start "VeriMetrix AI engine :8000" cmd /k "cd /d %~dp0ai-engine && .venv\Scripts\uvicorn app.main:app --port 8000"
)

REM ---- backend --------------------------------------------------
echo [2/3] Starting backend on http://localhost:8080 ...
start "VeriMetrix backend :8080" cmd /k "cd /d %~dp0backend && set SPRING_PROFILES_ACTIVE=%SPRING_PROFILES_ACTIVE% && mvnw.cmd spring-boot:run"

REM ---- frontend -------------------------------------------------
echo [3/3] Starting frontend on http://localhost:5173 ...
pushd frontend
if not exist node_modules (echo     installing npm packages ^(one time^)... & call npm install)
popd
start "VeriMetrix frontend :5173" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All three started in separate windows.
echo Open http://localhost:5173 in your browser ^(backend may take ~30-60s on first run^).
echo Close those windows to stop the app.
echo.
timeout /t 25 >nul
start http://localhost:5173
endlocal

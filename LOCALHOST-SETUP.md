# VeriMetrix — localhost par chalane ka tarika (Hindi)

Teen parts hain: **frontend (5173)**, **backend (8080)**, **AI engine (8000)**.
Start script sab kuch khud handle kar leta hai.

## 1. Ek baar install karo

| Tool | Zaroori kis liye | Link |
| --- | --- | --- |
| **JDK 25** | backend | https://adoptium.net |
| **Node.js 20+** | frontend | https://nodejs.org |
| Python 3.10+ | AI engine (OCR) — optional | https://python.org |
| Tesseract OCR | label padhne ke liye — optional | Windows: https://github.com/UB-Mannheim/tesseract/wiki |
| MySQL 8 | optional — default H2 chalta hai | https://dev.mysql.com/downloads |

Install ke baad terminal me check karo: `java -version`, `node -v`.

## 2. Chalao

**Windows:** folder kholo aur `start-windows.bat` par double-click karo.

**macOS / Linux:**
```bash
cd verimetrix
chmod +x start-mac-linux.sh backend/mvnw
./start-mac-linux.sh
```

Pehli baar npm packages + Python venv download honge (2–4 min, internet chahiye).
Uske baad browser me kholo: **http://localhost:5173**

Backend pehli baar ~30–60 sec leta hai. Agar page par error aaye to 1 minute ruk kar refresh karo.

## 3. MySQL ke saath (optional)

Default me **H2** embedded DB use hoti hai — MySQL ki zarurat nahi.
MySQL chahiye to:

```sql
CREATE DATABASE verimetrix_db;
CREATE USER 'springstudent'@'localhost' IDENTIFIED BY 'springstudent';
GRANT ALL ON verimetrix_db.* TO 'springstudent'@'localhost';
```
Phir: `start-windows.bat mysql`  ya  `./start-mac-linux.sh mysql`

## 4. Manually chalana ho to

```bash
# AI engine
cd ai-engine && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000        # Windows: .venv\Scripts\uvicorn app.main:app --port 8000

# Backend (H2)
cd backend && SPRING_PROFILES_ACTIVE=h2 ./mvnw spring-boot:run   # Windows: set SPRING_PROFILES_ACTIVE=h2 && mvnw.cmd spring-boot:run

# Frontend
cd frontend && npm install && npm run dev
```

## 5. Check karo sab chal raha hai

- Frontend: http://localhost:5173
- Backend health: http://localhost:8080/api/health → `{"status":"UP","aiEngine":"up",...}`
- AI engine docs: http://localhost:8000/docs
- App me **Settings → Test connection** se AI engine + OCR status dikhta hai.

## 6. Common problems

| Problem | Fix |
| --- | --- |
| `java` / `npm` not recognized | Install karke terminal (ya PC) restart karo |
| Port 5173 / 8080 busy | Purana process band karo, ya `PORT=8081` set karo |
| Har rule "Review Required" | AI engine ya Tesseract nahi chal raha — step 1 dekho |
| Sample/demo inspections dikh rahe | Settings me **Live API** select karo (`VITE_USE_MOCK=false`) |
| MySQL connection error | H2 mode use karo (script bina argument chalao) |
| `./mvnw: Permission denied` | `chmod +x backend/mvnw` |

Frontend config `frontend/.env` me hai; backend env vars `backend/src/main/resources/application.properties` me documented hain.

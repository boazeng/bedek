# CMM — Construction Malfunction Management

מערכת SaaS לרישום ומעקב אחרי ליקויי בניה בתקופת הבדק.
שלב 1 (אפיון נוכחי): בסיסי הנתונים המלאים + דאשבורד ראשי לכל חברה.
שלבים הבאים: ערוצי קלט (Email/WhatsApp/PDF-AI/סיור מפקח), מסך ניהול ליקויים, פרוטוקול מסירה דיגיטלי.

## ארכיטקטורה

- **Backend**: FastAPI · SQLAlchemy 2 · PostgreSQL
- **Frontend**: React 18 · Vite · TypeScript · Tailwind · עיצוב TACT (warm-cream + steel-blue, RTL)
- **Multi-tenancy**: DB משותף עם `company_id` בכל טבלה. הזיהוי כעת דרך header `X-Company-Slug` (יוחלף בעתיד ב-JWT).

```
backend/
  app/
    main.py            # FastAPI app + CORS + on_startup create_all
    config.py          # settings מ-.env
    database.py        # engine + SessionLocal + Base
    deps.py            # get_db, get_current_company (tenant)
    models/            # SQLAlchemy models (חברה, פרויקט, רוכש, יחידת ממכר, ליקוי, ...)
    schemas/dashboard.py
    api/dashboard.py   # GET /api/dashboard — KPI + per-project
    api/health.py
    seed.py            # demo tenant + 3 projects + ~70 defects
frontend/
  src/
    App.tsx
    pages/Dashboard.tsx
    components/        # TopBar, KpiCard, ProjectCard, StatusBar, TactLogo, TactIcon
    lib/api.ts         # fetch wrapper, types
    styles/            # TACT tokens.css + recipes.css
```

## הרצה מקומית

### אופציה 1: Docker Compose (המומלץ)

```bash
docker compose up --build
```

לאחר עליית השירותים, טוען דאטה דמו:
```bash
docker compose exec backend python -m app.seed
```
- Frontend: http://localhost:8080
- API: http://localhost:8000/docs

### אופציה 2: הרצה ישירה

```bash
# Backend (Python 3.12)
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1                  # Windows
pip install -r requirements.txt
copy .env.example .env                      # Windows
python -m app.seed
uvicorn app.main:app --reload
```

```bash
# Frontend
cd frontend
npm install
npm run dev      # http://localhost:5173
```

ה-frontend מצפה לדאטה ב-slug `demo` (ברירת מחדל). כדי להחליף:
```js
// בקונסולה של הדפדפן
localStorage.setItem('cmm-tenant-slug', 'my-company')
```

## פריסה ל-AWS

הסטאק תוכנן להיות תואם AWS מהיום הראשון:

| רכיב | שירות AWS מומלץ |
|------|------------------|
| בסיס נתונים | **RDS PostgreSQL** (db.t4g.micro לתחילה, encryption-at-rest, snapshot יומי) |
| Backend | **ECS Fargate** או **App Runner** עם ה-Dockerfile של `backend/`. הגדר את `DATABASE_URL` ל-RDS endpoint וה-`CORS_ORIGINS` לדומיין הפרודקשן. |
| Frontend | **S3 + CloudFront** (העלאת `dist/` כסטטי) או הקונטיינר nginx ב-ECS. |
| העלאת קבצים (נספחים) | **S3** (החלף את `MalfunctionAttachment.file_path` בקריאה presigned URL) |
| Secrets | **AWS Secrets Manager** עבור `DATABASE_URL` |
| Migrations | החלף את `Base.metadata.create_all` (in `main.py`) ב-**Alembic** לפני production. |

### צעדים מינימליים לפרודקשן הראשונה
1. צור RDS Postgres ב-VPC פרטי.
2. דחוף את ה-Docker image של `backend/` ל-ECR.
3. הרץ ECS Fargate service מאחורי ALB. Health-check על `/api/health`.
4. ב-`backend/app/seed.py` שמר רק את ה-`Company.slug = "demo"` להדגמה — לחברות אמיתיות פתח דרך מסך admin (שלב הבא).
5. הפרונטאנד: `npm run build` → `aws s3 sync dist/ s3://...` → CloudFront.

## מודל הנתונים — תקציר

- `companies` — טננטים. `slug` הוא מפתח חיצוני.
- `users` — משתמשי הטננט (admin/manager/inspector/buyer).
- `projects` — פרויקטים. שדה `company_id` לסינון tenant.
- `buyers` — רוכשים.
- `sale_units` — יחידות ממכר (דירה/חניה/מחסן/חנות/שטח ציבורי). `(project_id, unit_type, unit_number)` מפתח טבעי.
- `location_catalog` — קטלוג מיקומים בתוך הממכר (סלון/מטבח/...), per-company, ניתן לעריכה.
- `delivery_protocols` — פרוטוקולי מסירה (כותרת).
- `malfunctions` — **טבלת הליבה**. כוללת status, source, group, location, project, unit, buyer, opened_at, closed_at, assignee, description.
- `malfunction_attachments` — מסמכים / תמונות (1:N לליקוי).

ה-enums המלאים (סטטוס/מקור/קבוצה) ב-[backend/app/models/malfunction.py](backend/app/models/malfunction.py).

## API — שלב 1

| Method | Path | תיאור |
|--------|------|--------|
| GET | `/api/health` | health check |
| GET | `/api/dashboard` | KPI כלליים + פירוט לפי פרויקט. דורש header `X-Company-Slug`. |

ה-OpenAPI החי זמין ב-`/docs`.

## שלבים הבאים (לפי האפיון)

1. CRUD מלאים: פרויקטים, רוכשים, יחידות ממכר, פרוטוקולי מסירה, ליקויים (כולל מסך אחזקה עם סינון לפי כל השדות).
2. ערוצי קלט:
   - WhatsApp bot (Twilio או Meta WhatsApp Cloud API).
   - פיענוח דוח-בדק PDF דרך סוכן AI (Claude API + structured output).
   - מסך סיור מפקח מובייל.
3. אימות + ניהול משתמשים (Cognito + JWT).
4. אפליקציית מובייל / PWA למפקחים בשטח.
5. חתימה דיגיטלית בפרוטוקול מסירה.

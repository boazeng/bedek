# CMM — Construction Malfunction Management

SaaS to manage construction defects (ליקויי בניה) during the warranty period (תקופת הבדק). Multi-tenant, multi-language (Hebrew RTL UI), targeted at construction-developer customers in Israel. Local-first dev, deployed to AWS.

## Project rules

### 1. File size limit
Every source file MUST stay **under 500–600 lines**. Applies to all `*.py`, `*.ts`, `*.tsx`, `*.css`, `*.sql` — anything a human edits. Exempt: database dumps, migration files, lock files.

If a file is growing past 400 lines, split it before it hits the limit. Prefer splitting by responsibility (one router file → multiple smaller routers; one big page → page + extracted form/table components).

### 2. Layered architecture (backend)
Strict separation between layers. Imports flow **downward only**.

```
api/         ← HTTP controllers. Thin. Validates → calls services.
schemas/     ← Pydantic DTOs (request/response shapes).
deps.py      ← FastAPI dependencies (auth, db session, permission gates).

services/    ← Business logic. The only layer allowed to combine
              models + agents + integrations.

agents/      ← AI / LLM calls. Pure: take data in, return data out.
              No DB session, no file IO directly.

integrations/← External world: storage (S3), WhatsApp, OAuth, email.
              Each has a swappable interface (Local vs S3).

models/      ← SQLAlchemy ORM. Pure data shape, no business logic.
database.py  ← Engine + SessionLocal.
auth/        ← Token issue/decode (used by deps.py).
config.py    ← Settings from env vars.
```

**Forbidden imports:**
- `models/` → ANY higher layer
- `agents/` → `integrations/`, `models/`, `services/`
- `integrations/` → `agents/`, `models/`, `services/`
- `api/` doing direct AI calls or external HTTP — must go through services

**Allowed imports:**
- `services/` may import from any of: `models/`, `agents/`, `integrations/`, `schemas/`, `deps.py`
- `api/` imports from `services/`, `schemas/`, `deps.py`

## Tech stack

- **Backend:** FastAPI + SQLAlchemy 2.0 + Pydantic 2
- **DB:** SQLite locally (zero-install), PostgreSQL on AWS RDS
- **Frontend:** React 18 + Vite + TypeScript + Tailwind 3 + TACT design system
- **Auth:** Dev-login (current), Google OAuth via `shared-auth` (planned)
- **Deployment:** Local for dev, AWS App Runner + RDS + S3 + CloudFront (planned)

## Multi-tenancy

Shared DB. **Every tenant-scoped table has a `company_id` column.** Filtering is enforced by FastAPI dependencies (`get_current_company`, `allowed_project_ids_for`) — never trust client-supplied company_id. Super admin is the only role with no `company_id`.

## Roles

| Role | company_id | Capability |
|---|---|---|
| `super_admin` | NULL | All companies, all data |
| `company_admin` | set | Manage users + everything in own company |
| `company_user` | set | Assigned projects (or all, if `has_all_projects=True`) |
| `end_customer` | set | Own units only (via `buyer_id` link) |

## Dev setup

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend
cd frontend
npm install
npm run dev    # http://localhost:5173
```

Dev login (no password): see emails printed by `app.seed`. `root@cmm.io` is the super admin.

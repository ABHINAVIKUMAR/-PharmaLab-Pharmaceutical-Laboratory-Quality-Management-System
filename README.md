# PharmaLab – Pharmaceutical Laboratory Quality Management System

A secure, cloud-ready platform for managing pharmaceutical **batches, laboratory test results, quality deviations (OOS), CAPA and quality analytics** – with role-based access control and a tamper-evident audit trail.

| Tier | Technology |
|------|------------|
| Frontend | React 18 (Vite), Tailwind CSS, Lucide icons, Recharts, Axios (JWT interceptors) |
| Backend | Python FastAPI, SQLAlchemy 2 ORM, Pydantic v2 validation, PyJWT + Passlib (bcrypt), Python `logging` |
| Database | PostgreSQL (local, Docker) · **Azure SQL Database** · SQLite (zero-setup default) – switch via `DATABASE_URL` |
| Documents | **Azure Blob Storage**, automatic local `uploads/` fallback when no connection string is set |
| Analytics | SQL views (`database/views*.sql`) for **Power BI** + in-app dashboard |

---

## 1. Quick start (≈ 3 minutes)

Prerequisites: **Python 3.10+** and **Node.js 18+**.

**Windows (PowerShell / cmd) – double-click or run:**

```powershell
setup.bat            # one time: venv, pip install, npm install, .env files
run-backend.bat      # terminal 1 → http://127.0.0.1:8000  (API docs at /docs)
run-frontend.bat     # terminal 2 → http://localhost:5173
```

**macOS / Linux:**

```bash
./setup.sh
./run-backend.sh     # terminal 1
./run-frontend.sh    # terminal 2
```

Open **http://localhost:5173**. On the first start the backend creates the tables and seeds demo data automatically (`AUTO_SEED=true`).

### Demo accounts  (password for all: `PharmaLab@2026`)

| Role | Email | Can do |
|------|-------|--------|
| Admin | `admin@pharmalab.io` | Everything · user management · audit trail |
| QA Officer | `qa@pharmalab.io` | Approve/reject batches · deviations & CAPA · close deviations |
| QC Officer | `qc@pharmalab.io` | Test specifications · verify results · raise OOS deviations |
| Lab Technician | `tech@pharmalab.io` | Register samples · enter results · upload reports |

The login page has one-click buttons for each account, and the sidebar has a **role switcher** so you can see RBAC in action instantly.

### Using PostgreSQL instead of SQLite

```bash
docker compose up -d                 # PostgreSQL 16 on localhost:5432
```
In `.env` set:
```
DATABASE_URL=postgresql+psycopg2://pharmalab:pharmalab@localhost:5432/pharmalab
```
Restart the backend – tables are created automatically (`database/schema.sql` is the equivalent manual script).

### Re-seeding / resetting

```bash
python -m backend.seed        # seeds only if the users table is empty
```
To start over with SQLite delete `pharmalab.db`; with PostgreSQL run `docker compose down -v`.

### Run the automated tests

```bash
pytest backend/tests -v       # isolated temp SQLite DB + temp upload folder
```

---

## 2. What the application does

**Workflow:** register product → define test specifications → register batch (`QUARANTINED`) → register sample (batch → `TESTING`) → enter results (**automatic PASS/FAIL**) → QC verifies → failures become **OOS deviations** → QA assigns **CAPA** → CAPA completed & verified → deviation closed → QA **releases** (`APPROVED`) or **rejects** the batch.

| Page | Highlights |
|------|------------|
| **Login / Demo role switcher** | JWT login, self-registration (always Lab Technician), quick-fill demo buttons |
| **Quality Analytics** | KPI cards (active batches, pass rate, open deviations, overdue CAPAs), batch-status donut, pass-vs-fail trend, failed tests by product, CAPA compliance, recent OOS alerts with one-click *Raise deviation*, expiry watch |
| **Products & Batches** | Register products/batches, expiry tracking, per-batch test progress, release-criteria checklist, QA approve / reject, specification editor |
| **Sample Testing** | Register samples, enter measured values with **live PASS/FAIL gauge**, report upload, QC verification (four-eyes), OOS flagging |
| **Deviations & CAPA** | Kanban board / table, root-cause documentation, CAPA assignment, completion evidence, QA verification, overdue highlighting, “assigned to me” |
| **Audit Trail** *(Admin)* | Searchable / filterable / paginated log with before-after diffs and CSV export |
| **Users & Roles** *(Admin)* | Create users, change roles, deactivate, reset passwords |

### Business rules enforced server-side
* `PASS` ⇔ `min_limit <= measured_value <= max_limit` (one-sided specs supported); failures are flagged OOS automatically.
* A batch **cannot be APPROVED** if it is expired, a mandatory test is missing / failed / not yet QC-verified, or any deviation is still open. Only QA (or Admin) can approve/reject; rejection needs a reason.
* Allowed batch transitions are validated (`QUARANTINED → TESTING → APPROVED/REJECTED`).
* **Segregation of duties:** you cannot verify your own result.
* A deviation can be **closed** only by QA, once the root cause is documented and **every CAPA is VERIFIED**.
* A specification that already has results cannot be edited or deleted (traceability).
* Every create / update / approval / login is written to `audit_logs` (JSON before/after) **and** to `logs/audit.log`. The ORM blocks updates/deletes of audit rows; `database/schema.sql` adds a PostgreSQL trigger as well.

### RBAC summary

| Action | Lab Tech | QC | QA | Admin |
|--------|:-:|:-:|:-:|:-:|
| View everything | ✓ | ✓ | ✓ | ✓ |
| Register products & batches | | ✓ | ✓ | ✓ |
| Register samples, enter results, upload reports | ✓ | ✓ | upload | ✓ |
| Define specs, verify results | | ✓ | | ✓ |
| Raise deviations / OOS | | ✓ | ✓ | ✓ |
| Assign CAPA, verify CAPA, close deviation | | | ✓ | ✓ |
| Complete a CAPA | assignee | assignee | ✓ | ✓ |
| Approve / reject batch | | | ✓ | ✓ |
| Manage users, read audit log | | | | ✓ |

---

## 3. API overview  (interactive docs: http://127.0.0.1:8000/docs)

| Router | Endpoints |
|--------|-----------|
| `/api/auth` | `POST /register` · `POST /login` · `GET /me` · `GET /assignees` · Admin: `GET/POST /users`, `PUT /users/{id}` |
| `/api/products` | CRUD + `?q=` search (specs embedded) |
| `/api/batches` | CRUD · `POST /{id}/status` (release gate) · filters `status`, `product_id`, `q`, `expiring_within_days` |
| `/api/samples` | list · detail · `POST` register |
| `/api/tests` | `/definitions` CRUD · `POST /results` (auto PASS/FAIL) · `POST /results/{id}/verify` · `POST /results/{id}/flag-oos` |
| `/api/deviations` | list/detail · `POST` · `PUT /{id}` (investigation, root cause, status, close) |
| `/api/capas` | list (`overdue`, `mine`, …) · `POST` · `PUT` · `POST /{id}/complete` · `POST /{id}/verify` |
| `/api/files` | `POST /upload` (optionally `result_id`) · `GET /{stored_name}` |
| `/api/analytics` | `GET /dashboard` – all KPIs, trends, OOS alerts |
| `/api/audit` | `GET` (Admin only, read-only) with search / filters / pagination |

---

## 4. Project structure

```
pharmalab-qms/
├── backend/
│   ├── main.py  config.py  database.py  models.py  schemas.py
│   ├── security.py  audit.py  serializers.py  seed.py
│   ├── routers/   auth products batches samples tests deviations capas files analytics audit
│   ├── services/  quality.py (spec evaluation, release gate)  storage.py (Azure Blob / local)
│   └── tests/     test_qms_workflows.py
├── database/      schema.sql · views.sql (PostgreSQL) · views_azure_sql.sql (T-SQL)
├── frontend/      Vite + React app (src/pages, components, context, api)
├── docker-compose.yml   .env.example   setup/run scripts
```

---

## 5. Deploying to Microsoft Azure

Target architecture: **Azure App Service** (FastAPI + built React app) → **Azure SQL Database** (relational data) + **Azure Blob Storage** (reports / CoA) → **Power BI** (analytics).

### 5.1 Azure SQL Database
1. Portal → *Create a resource* → **SQL Database** (new logical server, SQL authentication or Entra ID). Basic/Serverless tier is enough.
2. *Networking*: enable **“Allow Azure services and resources to access this server”** and add your own IP for local access.
3. Install the **ODBC Driver 18 for SQL Server** on your machine and `pip install pyodbc`.
4. Connection string (URL-encode special characters in the password):
   ```
   DATABASE_URL=mssql+pyodbc://<user>:<password>@<server>.database.windows.net:1433/<db>?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no
   ```
5. Start the backend once – SQLAlchemy creates all tables. Then (optional demo data) `python -m backend.seed`.
6. Create the analytical views: run `database/views_azure_sql.sql` in the Query editor / Azure Data Studio.

### 5.2 Azure Blob Storage
1. *Create a resource* → **Storage account** (Standard, LRS). Keep *Allow Blob anonymous access* **disabled** – the API serves files only to authenticated users.
2. *Security + networking → Access keys* → copy the **connection string**.
3. Set `AZURE_STORAGE_CONNECTION_STRING` (and optionally `AZURE_STORAGE_CONTAINER`, default `lab-documents`; created automatically). With the variable empty the app stores files in `./uploads` instead.

### 5.3 Azure App Service (single service: API + website)
```bash
cd frontend && npm install && npm run build && cd ..      # creates frontend/dist – served by FastAPI
az login
az group create -n pharmalab-rg -l centralindia
az appservice plan create -g pharmalab-rg -n pharmalab-plan --is-linux --sku B1
az webapp create -g pharmalab-rg -p pharmalab-plan -n <unique-app-name> --runtime "PYTHON:3.12"
az webapp config set -g pharmalab-rg -n <unique-app-name> \
   --startup-file "gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 backend.main:app"
az webapp config appsettings set -g pharmalab-rg -n <unique-app-name> --settings \
   SCM_DO_BUILD_DURING_DEPLOYMENT=true WEBSITES_PORT=8000 \
   SECRET_KEY="<python -c 'import secrets;print(secrets.token_urlsafe(48))'>" \
   DATABASE_URL="<azure sql url>" AZURE_STORAGE_CONNECTION_STRING="<blob conn string>" \
   CORS_ORIGINS="https://<unique-app-name>.azurewebsites.net" AUTO_SEED=false
az webapp up -g pharmalab-rg -n <unique-app-name> --runtime "PYTHON:3.12"   # deploys the repo (backend/requirements.txt is installed)
```
Notes
* Put `pyodbc` in `backend/requirements.txt` for the Azure build and use a Python image that includes the MS ODBC driver (or a custom container) – see Microsoft docs “Connect to Azure SQL from App Service (Linux)”.
* Use **Key Vault references** (`@Microsoft.KeyVault(SecretUri=…)`) for `SECRET_KEY`, `DATABASE_URL` and the storage key.
* HTTPS is enforced by App Service (*Settings → TLS/SSL → HTTPS Only = On*).
* **Set `AUTO_SEED=false`** in production. To create the first admin, seed once locally against the cloud DB (or insert a user), then change the password in *Users & Roles*.
* Alternative split deployment: host `frontend/dist` on **Azure Static Web Apps**, build with `VITE_API_URL=https://<api>.azurewebsites.net`, and add the site URL to `CORS_ORIGINS`.

### 5.4 Power BI
1. Power BI Desktop → **Get data → Azure SQL database** → server `<server>.database.windows.net`, database `<db>` → *Database* credentials.
2. Choose **Import** (or DirectQuery) and select the views:
   * `vw_batch_quality_summary` – one row per batch: status, tests run/passed/failed, pass-rate %, open deviations
   * `vw_test_pass_rates` – pass-rate per product & test
   * `vw_capa_compliance_tracker` – open / overdue / completed CAPAs, days overdue
   * `vw_oos_deviation_pipeline` – deviations with their failing result and CAPA progress
3. Suggested visuals: donut of `batch_status`, column chart of `failed` by `product_name`, KPI cards for `open_deviations` and `SUM(is_overdue)`, table of overdue CAPAs. **Publish** to the Power BI service and schedule a refresh (use an on-premises/cloud gateway only if the DB is not publicly reachable).

---

## 6. Security notes
* Passwords hashed with bcrypt (Passlib); JWT (HS256) with configurable expiry; **change `SECRET_KEY`** outside development.
* Pydantic v2 schemas reject unknown fields and validate ranges, dates, e-mails and enums; SQLAlchemy parameterises every query.
* Upload allow-list (`pdf, png, jpg, csv, xlsx, txt, docx`), size limit (`MAX_UPLOAD_MB`), generated blob names, path-traversal-proof downloads, authentication required.
* Secrets only via environment variables / `.env` (git-ignored) – use Key Vault on Azure.
* This is a teaching/demo implementation inspired by 21 CFR Part 11 / GxP principles; formal computer-system validation (IQ/OQ/PQ), electronic signatures and password policies would be required for regulated production use.

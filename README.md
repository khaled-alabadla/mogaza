# قسم المعلومات والشكاوي — بلدية غزة

**Gaza Municipality: locations & intersections database**

This is an Arabic, right-to-left web application for searching and managing Gaza Municipality's official list of places and intersections. For each place it stores the name, description, building number, and street number.

> **Excel is only used for the initial data migration. PostgreSQL is the permanent database.**
>
> The legacy workbook (`SULAIMAN_MOEN_HABIB.xlsx`) was imported once with a management command. The running application never reads, searches, writes, or needs any Excel file. Its search does not depend on the old `J:K` helper table or on any Excel formula.

---

## Architecture

```
┌──────────────────┐   REST (JSON, same origin)   ┌──────────────────┐        ┌──────────────┐
│ React (Vite)     │ ───────────────────────────► │ Django + DRF     │ ─────► │ PostgreSQL   │
│ Arabic RTL SPA   │   session cookie + CSRF      │ auth, roles,     │  ORM   │ single source│
│                  │ ◄─────────────────────────── │ search, audit    │ ◄───── │ of truth     │
└──────────────────┘                              └──────────────────┘        └──────────────┘

Legacy Excel ──(one time: manage.py import_locations)──► PostgreSQL        Excel ✗ at runtime
```

| Layer    | Technology |
|----------|------------|
| Backend  | Python, Django, Django REST Framework, django-cors-headers |
| Database | PostgreSQL (uses the `pg_trgm` extension for fast partial-text search) |
| Frontend | React 19, Vite, Tailwind CSS 4, React Router, Axios, IBM Plex Sans Arabic (self-hosted) |
| Import   | openpyxl, used only by the one-time `import_locations` command |

```
backend/
  config/            settings (all from environment), urls, pagination
  apps/accounts/     custom User with role (admin/editor/viewer), login/logout/me, user management
  apps/locations/    Location + StreetName models, search, CRUD, soft delete, import command
  apps/audit/        AuditLog model + read-only API
frontend/
  src/components/    SearchBar, LocationCard, RecordForm, ConfirmDialog, Navbar, Toast, …
  src/pages/         LoginPage, DashboardPage, UsersPage, AuditLogsPage, NotFoundPage
  src/context/       AuthContext, ToastContext
  src/services/      api.js (the only way the UI gets data)
deploy/              nginx example
```

## Data model

**Location** (`apps/locations/models.py`)

| Field | Type | Notes |
|-------|------|-------|
| `place_name` | varchar(255), required | From Excel column E (التقاطع) |
| `description` | varchar(500) | From Excel column F (المسمي العام) |
| `building_number` | varchar(20) | From Excel column G (مبني). Stored as **text**, because the source contains values like `55F` and leading zeros must be kept |
| `street_number` | varchar(20) | From Excel column H (شارع). Stored as text for the same reasons |
| `is_active` | bool | Soft delete flag |
| `created_at/by`, `updated_at/by`, `deleted_at/by` | | Who did what, and when |
| `search_text` | text (internal) | Normalized copy used by search, with a trigram GIN index |

Place names are **not** unique. Two places may share a name, and search returns all of them.

**StreetName**: common street name → official street name. This comes from the small legacy table in columns B:C (الشارع العام / الشارع الرسمي). It was migrated so that data isn't lost, and it can be searched and managed from the "أسماء الشوارع" tab.

**AuditLog**: user, action (`CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `IMPORT`), entity, `before_data`, `after_data`, IP address, and timestamp.

## User roles

| Action | Admin | Editor | Viewer | Anonymous |
|--------|:-----:|:------:|:------:|:---------:|
| Search / view | ✓ | ✓ | ✓ | only if `PUBLIC_SEARCH_ENABLED=True` |
| Add / edit / delete | ✓ | ✓ | ✗ | ✗ |
| View and restore deleted records | ✓ | ✗ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ | ✗ |
| View the audit log | ✓ | ✗ | ✗ | ✗ |

Every permission is enforced **on the server** (`apps/accounts/permissions.py`). Hiding buttons in the UI is only a convenience.

## How search works

* `GET /api/locations/?search=<text>&page=1` runs in PostgreSQL. The browser never downloads the whole database.
* The query and the stored `search_text` are normalized the same way. This removes diacritics and tatweel, and treats these as equal: أ/إ/آ→ا, ة→ه, ى→ي, and Arabic-Indic digits→0-9. For example, `احمد` finds `أحمد`, `مدرسه` finds `مدرسة`, and `١٠٥٠` finds `1050`.
* Search is partial. Every word you type must appear somewhere in the name, description, building number, or street number, in any order. So `مجلس`, `الوزراء`, and `مجلس الوزراء` all find «مجلس الوزراء».
* Results whose name starts with the query come first, then name matches, then description and number matches. Results are paginated (20 per page).
* A `pg_trgm` GIN index keeps `LIKE '%…%'` fast at tens of thousands of rows.

## How data management works

* **Add**: «إضافة موقع» → form → `POST /api/locations/` → PostgreSQL. The record is searchable immediately.
* **Edit**: «تعديل» → form → `PATCH /api/locations/{id}/`.
* **Delete**: «حذف» → confirmation dialog («هل أنت متأكد من حذف هذا الموقع؟») → `DELETE /api/locations/{id}/`. This is a **soft delete**: the row gets `is_active=false`, `deleted_at`, and `deleted_by`, and disappears from normal search. Admins can tick «عرض المحذوفة» and restore it.
* Every change is written to the audit log with before and after values.

## API

| Method | URL | Who |
|--------|-----|-----|
| POST | `/api/auth/login/` (username + password; e-mail login is not accepted) | anyone (rate-limited) |
| POST | `/api/auth/logout/` | logged-in users |
| POST | `/api/auth/change-password/` (`current_password`, `new_password`) | logged-in users (own password) |
| GET | `/api/auth/me/` (current user, sets the CSRF cookie) | anyone |
| GET | `/api/locations/?search=&page=&page_size=` | see roles |
| GET | `/api/locations/{id}/` | see roles |
| POST / PUT / PATCH / DELETE | `/api/locations/` · `/api/locations/{id}/` | admin, editor |
| GET | `/api/locations/?status=deleted` · POST `/api/locations/{id}/restore/` | admin |
| * | `/api/streets/…` (same shape as locations) | same as locations |
| GET / POST / PATCH / DELETE | `/api/users/` · `/api/users/{id}/` (PATCH `is_active` to deactivate; DELETE removes the user permanently, their audit history is kept) | admin |
| GET | `/api/audit-logs/?action=&entity_type=&entity_id=&user=` | admin |

### جدول المياه (water schedule)

**What the website shows (page `/water`) is the official sheet «جدول توزيع المياه حسب توجيهات المواطنين»:**
rows of *الموعد* (days, e.g. «السبت / الثلاثاء») → *العنوان* (list of areas). It was seeded from the paper
sheet (migration `water/0007_seed_distribution_table`) and is edited from the page by admins/editors.

| Method | URL | Who |
|--------|-----|-----|
| GET | `/api/water-table/` → `{today, today_display, results: [{id, days, days_text, day_labels, note, sort_order, area_list: [{id, name}]}]}` (not paginated) | see roles |
| POST / PATCH | `/api/water-table/` · `/api/water-table/{id}/` `{days: [0, 3], areas: ["النديم", …], note?}` (`areas` replaces the row's list) | admin, editor |
| DELETE | `/api/water-table/{id}/` | admin, editor |

The per-building / per-zone data below (imported from gaza-city.org) is kept in the database and API but is
**no longer shown in the website**.

Full contract: [`docs/water-schedule.md`](docs/water-schedule.md) (section «v2 — Water zones»). Days are
`0=السبت … 6=الجمعة`, times `HH:MM`.

Schedules belong to **water zones** (مناطق المياه): each neighborhood is split into zones («منطقة A», «منطقة B» …)
and every building (location) of a zone shares the zone's weekly slots. A building's neighborhood always follows its
zone. Every write is audit-logged (`waterzone`, `location`, `neighborhood`).

| Method | URL | Who |
|--------|-----|-----|
| GET | `/api/neighborhoods/` (plain array, not paginated, with `locations_count` / `scheduled_count` / `zones_count`) | see roles |
| POST / PATCH / DELETE | `/api/neighborhoods/` · `/api/neighborhoods/{id}/` (DELETE → 400 while locations or zones reference it) | admin, editor |
| GET | `/api/water-zones/?neighborhood=&day=&search=&page=&page_size=` (paginated, 50 per page; item has `slots`, `schedule_text`, `days`, `locations_count`) | see roles |
| GET | `/api/water-zones/{id}/` (same item + its active `locations`) | see roles |
| POST / PUT / PATCH / DELETE | `/api/water-zones/` · `/api/water-zones/{id}/` (`slots` replaces all slots; code/name auto-assigned on create; DELETE leaves the buildings without a zone) | admin, editor |
| POST | `/api/water-zones/{id}/assign/` · `/api/water-zones/{id}/unassign/` `{"location_ids": [...]}` | admin, editor |
| GET | `/api/water-zones/summary/?neighborhood=` (today in Asia/Gaza + zones per day, `zones_count`, `locations_count`) | see roles |
| GET | `/api/locations/?neighborhood=&water_zone=&has_schedule=1` (payload adds `neighborhood(_name)`, writable `water_zone`, `water_zone_name`, `water_schedule`, `water_schedule_text`) | see roles |

Optional, controlled import from gaza-city.org (never called by the web app; ≥1 s between requests). Each building is put into the zone of its neighborhood with exactly the same windows, or into a new lettered zone; «no schedule» pages leave the zone unchanged:

```bash
python manage.py fetch_water_schedules [--limit N] [--delay 1.0] [--dry-run] [--only-missing]
```

Zones are then named after the nearest landmark so people can read them («شرق دوار حيدر»,
«محيط مفترق الشعبية»). This needs the buildings' coordinates (centroid of the footprint from the
municipality GIS, same 1 request/second limit). Only zones still named «منطقة A/B/…» are renamed unless
`--all` is given:

```bash
python manage.py fetch_coordinates --only-missing
python manage.py name_water_zones --dry-run
python manage.py name_water_zones
```

---

## Installation (development)

Requirements: Python 3.11+, Node.js 20+, PostgreSQL 14+.

### 1. PostgreSQL

```sql
-- as the postgres superuser
CREATE ROLE gaza_locations LOGIN PASSWORD 'choose-a-strong-password' CREATEDB;
CREATE DATABASE gaza_locations OWNER gaza_locations ENCODING 'UTF8';
\c gaza_locations
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- the migration also does this (pg_trgm is a trusted extension)
```

`CREATEDB` is only needed so that `manage.py test` can create its temporary test database.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env              # then edit: DJANGO_DEBUG=True for development, DB password, secret key
python manage.py migrate
python manage.py createsuperuser  # superusers always get the "admin" role
python manage.py runserver 127.0.0.1:8000
```

### 3. One-time Excel migration

```bash
python manage.py import_locations "path/to/SULAIMAN_MOEN_HABIB.xlsx" --dry-run   # inspect only
python manage.py import_locations "path/to/SULAIMAN_MOEN_HABIB.xlsx"             # import + verify
```

The command:

* opens the workbook read-only and never modifies it
* finds the worksheet and header row **by header text**, with no hard-coded rows
* reports record counts, missing values, and duplicates
* ignores formulas and the old `J:K` helper table
* migrates the B:C street-name table and skips the merged free-text note cells
* is **idempotent**: re-running it never creates extra copies, while real duplicates in the source are kept
* checks afterwards that every source record exists in PostgreSQL, and fails loudly if one is missing

After this step, the Excel file can be archived. The application does not need it.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api to http://127.0.0.1:8000)
```

### Run the tests

```bash
cd backend && python manage.py test apps     # API, auth, roles, search, CRUD, audit, migration (PostgreSQL)
cd frontend && npm test                      # component tests (Vitest + Testing Library)
```

### Build the frontend

```bash
cd frontend && npm run build                 # output: frontend/dist
```

---

## Environment variables (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `DJANGO_DEBUG` | `False` in production |
| `DJANGO_SECRET_KEY` | Required when DEBUG is off. Use a long random value |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated host names |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | Database connection |
| `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` | Front-end origin(s) |
| `PUBLIC_SEARCH_ENABLED` | Lets anonymous visitors search (read-only). Default `False` |
| `LOGIN_THROTTLE_RATE` | Login attempts per client, for example `10/min` |
| `SESSION_COOKIE_AGE` | Session lifetime in seconds |
| `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS` | HTTPS hardening (active when DEBUG is off) |

No secrets are committed. `.env` is git-ignored, and only `.env.example` files are in the repository.

## Production deployment notes

1. Create the PostgreSQL role and database with a strong password. Take regular backups with `pg_dump`.
2. In `backend/.env`, set `DJANGO_DEBUG=False`, a new `DJANGO_SECRET_KEY`, the real `DJANGO_ALLOWED_HOSTS`, and the real `CSRF_TRUSTED_ORIGINS`.
3. Run `pip install -r requirements.txt`, `python manage.py migrate`, `python manage.py collectstatic`, and `python manage.py createsuperuser`.
4. Run the one-time import, only if the database is still empty.
5. Start the API with `gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3` (use a systemd service).
6. Build the frontend with `npm ci && npm run build`. Serve `frontend/dist` and proxy `/api/` from the **same domain**. See `deploy/nginx.conf.example`.
7. Use HTTPS. With DEBUG off, secure cookies, HSTS, SSL redirect, nosniff, and `X-Frame-Options: DENY` are enabled.
8. Login rate limiting uses Django's cache. With several gunicorn workers, configure a shared cache (for example Redis or the database cache) so the limit applies across all workers.

## Deploying on Vercel

One Vercel project serves both halves from the **same domain**, so session cookies and CSRF work exactly as
behind nginx:

| Path | Served by |
|------|-----------|
| `/`, `/assets/*`, any SPA route | the React build (`frontend/dist`, built by `npm run build --prefix frontend`) |
| `/api/*`, `/django-admin/*`, `/static/*` | Django, as the Python function `api/index.py` (dependencies: root `requirements.txt`) |

All of this is configured in `vercel.json`. Keep the project's **Root Directory** set to the repository root.

1. **Database.** Vercel doesn't host PostgreSQL itself. Create one with the Neon integration from the Vercel
   Marketplace, or use any hosted PostgreSQL 14+. Put it in the same region as the functions (Project → Settings →
   Functions). `pg_trgm` is created by the migrations.
2. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | `postgres://…?sslmode=require` (use the provider's **pooled** connection string) |
   | `DJANGO_SECRET_KEY` | a new long random value |
   | `DJANGO_DEBUG` | `False` |
   | `NUM_PROXIES` | `1` (Vercel puts the real client address in `X-Forwarded-For`; the login throttle needs it) |
   | `DJANGO_CACHE_TABLE` | `django_cache` (shares the login throttle across function instances) |
   | `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` | only for a **custom domain**, e.g. `locations.example.gov.ps` / `https://locations.example.gov.ps`. The `*.vercel.app` URLs of the deployment are trusted automatically |
   | `PUBLIC_SEARCH_ENABLED`, `LOGIN_THROTTLE_RATE`, `SESSION_COOKIE_AGE` | optional, as above |

3. **Prepare the database once** from your machine, with `DATABASE_URL` pointing at the hosted database. Repeat
   `migrate` whenever a deploy adds migrations, **before** that deploy goes live:

   ```bash
   cd backend
   python manage.py migrate
   python manage.py createcachetable
   python manage.py createsuperuser
   python manage.py import_locations "path/to/SULAIMAN_MOEN_HABIB.xlsx"   # only if the database is still empty
   ```

4. **Deploy.** Import the Git repository in Vercel, or run `vercel --prod` from the repository root. Pushes to
   `main` then deploy automatically, and other branches get preview URLs.

Preview deployments use the same database as production unless you give the Preview environment its own
`DATABASE_URL`.

## Security summary

* Passwords are hashed with Django's PBKDF2 and checked against its password validators. Passwords are never returned by the API or stored in the audit log.
* Authentication uses session cookies (HttpOnly, SameSite=Lax, and Secure in production) plus CSRF tokens on every write.
* Role checks run server-side on every endpoint. Deactivated users can't log in or write anything.
* Login attempts are rate-limited, and failed attempts are audited.
* Input is validated and trimmed on the server. Number fields accept only letters, digits, and `- / .`.
* Locations are never hard-deleted through the API (soft delete). Users can be deactivated or permanently deleted by an admin; their past actions stay in the audit log under their username.
* Admins can't delete, deactivate or demote their own account, so they can't lock themselves out.
* Every user can change their own password from the key icon in the top bar (the current password is required).

## Credits

تم برمجة النظام بواسطة **المهندس بلال سمير قنوع**
تم جمع البيانات بواسطة **الأستاذ سليمان معين حبيب**
تحت إشراف **المهندس محمد ابراهيم بهار**

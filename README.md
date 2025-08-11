# Retirement Guardrails 


This zip contains **source only** (no `node_modules`). Small size is expected. After unzip, run `npm install` to fetch dependencies.

## Features
- Clean structure: `components/`, `hooks/`, `lib/`, `pages/api/`
- Upload CSV → server parses (`csv-parse`) → builds plan and persists to MariaDB
- Numeric X-axis + **dual Y-axes** so all actuals render
- Modal to add/edit actuals; kebab on rows for edit/delete
- Guardrail % in Settings, persisted to DB
- Simple password gate via `APP_PASSWORD`

## Setup
1) Copy env and fill in:
```bash
cp .env.example .env
```

2) Create DB & tables (adjust connection flags as needed):
```bash
# via TCP
mysql -h 127.0.0.1 -P 3306 -u root -p < db/schema.sql
# or use a specific db:
# mysql -h 127.0.0.1 -P 3306 -u root -p guardrails < db/schema.sql
```

3) Install & run:
```bash
npm install
npm run dev
```

4) Open http://localhost:3000 and sign in with `APP_PASSWORD`.

If you hit issues, check your DB connectivity and `.env` values (or set `DB_SOCKET` to your MariaDB socket).

## Notes
- API endpoints: `/api/plan`, `/api/actuals`, `/api/settings`, `/api/parse-csv`, `/api/plan-from-csv`
- You can swap MariaDB for MySQL as long as the driver supports it (we use `mysql2/promise`).


**Layout:** Top panel with Upload + Settings, Chart below, Actuals table with Add/Edit modal and row kebabs.

# Decision Collaboration Platform

This app now runs on:
- React + Vite (frontend)
- Node + Express (API)
- PostgreSQL in Docker (database)

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start Postgres in Docker:
```bash
docker compose up -d db
```

3. Start API + frontend:
```bash
npm run dev:full
```

4. Open:
- Frontend: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

## Docker Runtime (DB + API + Migration)

To run an up-to-date backend stack fully in Docker:
```bash
docker compose up -d --build db db-migrate api
```

What this does:
- `db`: starts PostgreSQL
- `db-migrate`: applies `db/migrations/add_decision_archive_metrics.sql`
- `api`: runs `server/index.js` against Docker DB

Check status:
```bash
docker compose ps
```

Check API health:
```bash
curl http://localhost:4000/api/health
```

## Environment

Use `.env`:
```env
VITE_API_URL=
DATABASE_URL=postgresql://decision_app:decision_app@localhost:5432/decision_app
JWT_SECRET=change-this-local-secret
PORT=4000
```

## Database Initialization

The DB schema is auto-applied on first container boot from:
`db/local/init.sql`

Important:
- Init scripts only run when the Postgres volume is empty.
- To re-run from scratch:
```bash
docker compose down -v
docker compose up -d db
```

### Applying New Decision Archive Migration (Existing DB)

If your database is already running with older schema, apply:
`db/migrations/add_decision_archive_metrics.sql`

Example:
```bash
docker compose exec -T db psql -U decision_app -d decision_app < db/migrations/add_decision_archive_metrics.sql
```

## Optional Dev Staff Accounts

Public signup creates only client users.
To seed consultant/psychologist/supervisor accounts:
```bash
npm run seed:dev
```

Default seeded password:
- `password123` (or `DEV_DEFAULT_PASSWORD` if set)

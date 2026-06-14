# tyek.ir — Decision-Support Platform (CLAUDE.md)

Project orientation for a fresh session. Persian/RTL decision-support app, live at
**https://tyek.ir**, currently **v1.0 in live testing** (invite-only).

## What it is
A consultant/psychologist ↔ client decision-collaboration tool with a supervisor
admin. Core flow per decision: **Definition → Analysis → Strategy → Action Plan →
Outcome**, plus threaded comments (visibility levels + unread tracking), tasks,
archive, and aggregate analytics. Roles: `supervisor`, `consultant`,
`psychologist`, `client`.

## Stack
- **Frontend:** React 19 + Vite 7, CSS Modules, RTL, Vazirmatn font. State via React
  Context (`Auth`, `Decision`, `Task`, `Comment`). Dependency-light (no router lib —
  path-based routing in `src/App.jsx`; no chart lib — inline SVG/CSS).
- **Backend:** Node + Express, `pg` (PostgreSQL), JWT auth (`jsonwebtoken`), bcryptjs.
- **Web:** nginx → static `dist/` + proxy `/api` → Node on `127.0.0.1:4000`.

## Repo layout
```
server/
  index.js        app wiring: middleware + mounts routers + error handler
  config.js       env + constants        db.js   pg pool
  utils.js        pure helpers (parsers, role checks, normalizeUsername)
  auth.js         JWT sign/verify middleware + getUserById
  access.js       domain access control, meta lookups, outcome-event txn, applyUpdate
  audit.js        logAudit() best-effort
  routes/         auth, profiles, admin, decisions, decisionItems, tasks,
                  comments, analytics, invitations, passwordResets, audit
src/
  App.jsx         routes: /login /signup /invite/<token> /reset/<token> else dashboard
  apiClient.js    typed fetch wrapper (Bearer token in localStorage)
  theme.js        light/dark theme (applied before render; CSP-safe)
  context/        Auth/Decision/Task/Comment providers
  views/          Login, Signup, ResetPassword, Dashboard, Home, DecisionInput,
                  Analysis, Strategy, ActionPlan, DecisionOutcome, Archive
  components/      Layout, ThemeToggle, DecisionTabs, CommentSection, OutcomeTracker,
                  AnalyticsPanel, InvitePanel, AuditPanel
db/migrations/    SQL migrations (see below)   db/local/init.sql  base schema
```

## Conventions
- **Persian/RTL** UI throughout — all user-facing strings in Persian; numbers via
  `Intl.NumberFormat('fa-IR')`.
- **Usernames are case-insensitive** (stored lowercase; login via `lower(username)`).
- Auth = Bearer JWT in `localStorage`; API is same-origin in prod (`VITE_API_URL` empty).

## Local development
Two options for the DB. Seeded staff users are `supervisor1` / `consultant1` /
`psych1` (all password `password123`) plus clients.
- **Docker:** `docker compose up -d db db-migrate` then `npm run dev:full`.
- **Homebrew pg fallback** (if Docker flaky): create db `decision_app` on `:5432`,
  load `db/local/init.sql` + every `db/migrations/*.sql`, seed, then `npm run server`
  + `npm run dev`.
- Local `.env` (gitignored) needs `DATABASE_URL`, `JWT_SECRET`, and for the Vite proxy
  add `CORS_ORIGIN=https://tyek.ir,http://localhost:5173`.
- Preview via `.claude/launch.json` server name `web` (Vite on :5173).

## Production (VPS)
- Host: SSH alias **`vanir`** (root@185.113.9.155). App at **`/opt/t1`**, env `/opt/t1/.env`.
- nginx serves `/opt/t1/dist`; systemd unit **`decision-app-api.service`** runs the API
  as the unprivileged **`decisionapp`** user (hardened).
- Other sites/DBs share this VPS. **Only ever touch the `decision_app` Postgres
  database** — never `accounting_app`, `friendscup`, `postgres`, or the MariaDB
  `ai-translator`. The app's DB role can only reach `decision_app`; still, guard on
  `current_database()` before any destructive SQL.

## Deploy
Repo is **public**, so the VPS can `git pull` over HTTPS (SSH:22 is blocked there).
1. Commit + `git push origin main` (local has GitHub SSH auth).
2. On `vanir`: `cd /opt/t1 && git pull origin main`
   *(fallback if pull is blocked: `git bundle create /tmp/t1.bundle main` locally →
   `scp` to vanir → `git pull --ff-only /tmp/t1.bundle main`)*.
3. Backend change → `systemctl restart decision-app-api.service`.
   Frontend change → `npm run build` on the server (Vite is installed there).
- Always verify after deploy (curl health/headers; for UI, verify locally via preview).

## Security posture (in place)
API runs non-root; CORS locked to an allowlist (env `CORS_ORIGIN`, default
`https://tyek.ir`); `X-Powered-By` off; nginx adds HSTS, CSP (self + Google Fonts),
X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy;
`server_tokens off`. Open follow-up ideas: login rate-limiting.

## Migrations (apply in order on a fresh DB, after `db/local/init.sql`)
`add_decision_archive_metrics` · `add_staff_hierarchy_and_comment_visibility` ·
`add_comment_read_tracking` · `add_decision_step_comment_reads` ·
`add_invitations_and_audit_log` · `add_password_resets_and_username_ci`

## v1.0 state (live testing)
- **Invite-only:** public signup disabled (`ALLOW_PUBLIC_SIGNUP=false`). New clients
  join via one-time links `https://tyek.ir/invite/<token>` and set their own password.
- **Admin:** one `supervisor` account (username `admin`). Credentials are held by the
  owner and are **not** stored in this repo. No self-service admin password change yet
  (reset via DB if lost). Supervisor can issue reset links for any user from the
  dashboard (→ `/reset/<token>`).
- **No consultant yet** — invited clients are unassigned until the admin creates a
  consultant and assigns them (همه مراجعان → choose consultant → ذخیره ارجاع‌ها).
- **Reset to blank baseline** (admin + 10 unused invites, no test data):
  `ssh vanir /opt/t1/scripts/reset-to-baseline.sh` — guarded to `decision_app`,
  auto-backs up first. Snapshots/backups live in `/opt/t1/backups/`.

## Feature surface (API)
`/api/auth` (signup, accept-invite, reset-password, login, me) · `/api/profiles` ·
`/api/admin` (users, assignments) · `/api/decisions` (+ archive, stats, details,
steps) · `/api/decision-items` · `/api/tasks` · `/api/comments` · `/api/analytics`
(role-scoped overview) · `/api/invitations` · `/api/password-resets` · `/api/audit`
(supervisor only).

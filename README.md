# timeoff

A company leave-application dashboard for a South African company — annual, sick,
family-responsibility, shared parental and year-end-closure leave, with an
employee → line-manager approval flow and email notifications.

**Fully self-hosted**: **Next.js** (App Router, TypeScript, Tailwind) + **plain
PostgreSQL** + in-app authentication (bcrypt + database sessions). No third-party
backend — runs anywhere Docker runs.

## Leave policy encoded

| Leave type              | Allocation                                   | Notes |
| ----------------------- | -------------------------------------------- | ----- |
| Annual leave            | 15 working days per leave year, builds at 1.25/month | 5 days held for the year-end closure; see rules below |
| Year-end closure (paid) | 5 company-paid days                          | Auto-granted — explained on the dashboard, never applied for |
| Sick leave              | 30 days / 36-month cycle (BCEA)              | Throttled in the first 6 months |
| Family responsibility   | 3 days per leave year (BCEA)                 | After 4 months' service |
| Parental leave          | 4 months and 10 days (100 working days), shared between the parents | Everyone; needs a signed agreement of the split uploaded |

Working days exclude weekends and South African public holidays. Parental
leave follows the Constitutional Court's 2025 shared-parental-leave ruling:
parents split four months and ten days between them, so every application
needs a letter signed by both saying how. Any request can carry a supporting
document.

### Annual leave rules

- **The leave year runs from each employee's start date**, not 1 January. Sick and
  family-responsibility leave use the same anchor; the company-paid closure days
  stay on the calendar year (`leave_types.cycle_anchor`).
- **5 days are held from day one of every leave year** for the December closure,
  so at most 10 can be booked. The company adds 5 paid days on top.
- **Booking ahead is allowed.** An employee may go into arrears (book days not yet
  accrued) but never past the leave year's maximum.
- **Unused bookable days carry over for six months, then expire**
  (`leave_types.carry_months`, BCEA s20(4)). Carried days are used first, by leave
  starting on or before the expiry date. The held closure days never carry over.
  The carried amount is fixed when a leave year starts and can be corrected per
  employee on **Admin → People** (their allocations).
- **Expiry reminders** are emailed to the employee when carried-over days have
  90, 30 and 7 days left (`src/lib/expiry-alerts.ts`). The check runs inside the
  app — a minute after boot and every six hours (`src/instrumentation.ts`) — and
  each warning is sent once (`leave_expiry_alerts`).

These rules are the company's reading of the BCEA; have them checked by whoever
advises on labour law before relying on them.

## Features

- **Request threads** — every request has its own page (`/requests/<id>`) with a
  conversation between the employee, their manager and anyone else involved.
  Each post emails the other participants; unread badges show in the tables.
- **Sick notes** — sick leave over 2 consecutive days (BCEA s23) requires a
  medical certificate upload (PDF/image, 5 MB). Files can also be added to any
  request's thread later. Stored in Postgres; only people who can see the
  request can open them.
- **Half days** — single-day requests can be morning or afternoon (0.5 days).
- **Calendar** — submitting emails the employee an out-of-office `.ics` event
  that updates itself on approval and disappears on rejection/cancellation.
  (The personal iCal feed at `/api/calendar` still works for existing links,
  but the Account page now only offers Google Calendar.)
- **Approve from the email** — each approver gets their own email with
  Approve / Decline buttons. The button opens a confirm page (`/decide/<token>`)
  that works without signing in; links are single-use, last 14 days and stop
  working once the request is decided (`src/lib/decisionLinks.ts`).
- **Nobody approves their own leave**, admins included (`can_approve()` in the
  schema). An admin's own requests go to their manager, backup or another admin.
- **Balance forecast** — the Apply form shows how much annual leave will have
  built up by the chosen dates and how far ahead the booking is; the Apply page
  shows the next few month-ends and the year end (`earnedBy()` in
  `src/lib/leave.ts`).
- **Reminders & backup approvers** — approvers are nudged after 3 days; after
  5 days the request escalates to the manager's backup approver (or admins).
  While a manager is on leave, their backup can approve for them.
- **CSV exports** (Admin → Exports) — monthly leave taken per person
  (payroll), all requests, and balances, per year.
- **Passwords** — self-service "forgot password" via emailed one-time link;
  change password on the Account page.
- **Login protection** — 5 wrong passwords for one email (or 20 from one
  connection) in 15 minutes pauses sign-in for the rest of those 15 minutes;
  reset requests are capped too (`src/lib/rateLimit.ts`, counted from the
  audit trail). Security headers (HSTS, no framing, nosniff) are set in
  `next.config.mjs`.
- **Google Calendar** — optional "Connect Google Calendar" on the Account page
  puts each person's leave straight into their own calendar as an Out of office
  event (pending → confirmed → removed). Setup in [DEPLOY.md](DEPLOY.md).
- **Gmail out-of-office** — opt-in under Google Calendar on the Account page.
  TimeOff sets Gmail's own vacation responder for the person's next approved
  full-day leave, with a "back on <next working day>" message or their own.
  Gmail starts and stops replying by itself; TimeOff only ever switches off a
  reply it set (`src/lib/gmailAutoReply.ts`, re-checked hourly).
- **Install as an app** — the Account page explains how to add TimeOff to a
  phone's home screen (or installs it directly where the browser allows).
  Manifest in `src/app/manifest.ts`, icons drawn by `src/app/app-icon/`.
- **Bulk import** — Admin → People → Import a spreadsheet: upload a CSV
  (template in `public/import-template.csv`, comma or semicolon), check the
  preview, then add up to 500 people, optionally emailing each a 7-day link to
  choose their password (`src/lib/employeeImport.ts`).
- **Leave allowances** — company defaults per leave type are edited in
  Admin → Leave defaults; Add employee (Admin → People) prefills them and lets you set a person's own numbers, which
  carry into every future leave year.
- **Public holidays** — calculated automatically from the Public Holidays Act
  (incl. Sunday → Monday), kept two years ahead; admins add declared days such
  as elections. A reminder email goes out a week before each one, suggesting a
  bridge day when there's a 4-day weekend to be had (opt out on Account).
- **One screen on laptops** — from 1024×640 up, every page fits the window like
  the dashboard: the page doesn't scroll, lists and the conversation scroll
  inside their own panels. Admin is split into tabs (People · Leave defaults ·
  Holidays · Exports · Audit trail). Phones scroll normally.
- **Audit trail** (Admin → Audit trail) — every submission, decision,
  cancellation, escalation, profile/role change, balance edit, deletion,
  holiday change, password event and sign-in, with who, when, before/after
  values and IP. Filterable and downloadable as CSV. The `audit_log` table is
  append-only (the database rejects updates/deletes) and survives employee
  deletion. Requests that existed before the trail was added are backfilled
  once on first boot.

## Architecture

- **App**: Next.js server components + server actions. Authorization is enforced
  server-side (no database RLS).
- **Auth**: `users` table (bcrypt password hashes) + `sessions` table + a signed
  HTTP-only cookie. See `src/lib/session.ts`.
- **Data**: `node-postgres` (`pg`) over `src/lib/data.ts`. Schema, business-logic
  functions and the `balance_summary` view live in [`db/schema.sql`](db/schema.sql)
  (idempotent — applied on every boot by `scripts/migrate.mjs`).
- **Email**: Resend (`src/lib/email.ts`), best-effort.
- **UI**: collapsible sidebar on desktop, floating bottom tab bar on phones
  (`src/components/Sidebar.tsx`). See [CHANGELOG.md](CHANGELOG.md) for history.

## Run it with Docker (recommended)

```bash
cp .env.docker.example .env      # fill in POSTGRES_PASSWORD, RESEND_*, SEED_ADMIN_*
docker compose up -d --build
```

This starts Postgres (with a persistent volume) and the app on `APP_PORT` (3000
by default). On first boot the schema is created and — if `SEED_ADMIN_EMAIL`/
`SEED_ADMIN_PASSWORD` are set and that user doesn't exist — an admin is seeded.

See [DEPLOY.md](DEPLOY.md) for Portainer.

## Local development

Work from a normal folder (e.g. `~/Developer/leave-dashboard`), **not** inside
Google Drive — Drive sync corrupts git and makes builds crawl.

### Without Docker (quickest — what the work Mac mini uses)

```bash
npm install
cp .env.example .env.local          # local settings; gitignored
npm run db:local                    # terminal 1: Postgres-compatible DB on :5432 (PGlite, data in .pglite/)
npm run db:migrate                  # terminal 2: apply schema + seed the admin from .env.local
npm run dev                         # http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env.local`.
Delete `.pglite/` to start from an empty database.

### With Docker

```bash
cp .env.docker.example .env         # sets POSTGRES_PASSWORD for the db container
docker compose up -d db             # real Postgres 16 on localhost:5432
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

### Testing without sending real emails or touching Google

- Leave `RESEND_API_KEY` empty and set `EMAIL_OUTBOX_DIR=./email-outbox` in
  `.env.local`: every email (incl. calendar invites) is saved there as HTML.
- Google Calendar stays hidden until `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  are set. The `GOOGLE_AUTH_BASE`, `GOOGLE_OAUTH2_BASE` and `GOOGLE_API_BASE`
  variables can point the integration (Calendar and Gmail) at a local stand-in
  for testing; any dummy client id/secret then makes the card appear.
- Approve-from-email links are in the saved emails in `email-outbox/`; open
  them while signed out to see what an approver sees.
- Background jobs (approval reminders, holiday emails) can be triggered with
  `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/reminders`
  when `CRON_SECRET` is set.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | app + migrate | Postgres connection string |
| `APP_URL` | app | The public address (`https://leave.zenithlabs.space`). Used for email links, redirects (sign-out, Google) and the Google sign-in return address — must be exact |
| `RESEND_API_KEY` / `RESEND_FROM` | emails | Resend sender (verified domain) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | migrate | First-run admin (created once) |
| `REMINDER_AFTER_DAYS` / `ESCALATE_AFTER_DAYS` | app | Approval nudge / escalation thresholds (default 3 / 5) |
| `REMINDERS` | app | `off` disables the built-in hourly reminder job |
| `CRON_SECRET` | app | Only for an external scheduler calling `POST /api/cron/reminders` |
| `HOLIDAY_REMINDER_DAYS` | app | How many days before a public holiday to email everyone (default 7) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | app | Google Calendar connection (optional; see DEPLOY.md) |
| `TOKEN_ENCRYPTION_KEY` | app | Encrypts stored Google access (defaults to the client secret) |
| `EMAIL_OUTBOX_DIR` | app (dev) | With no `RESEND_API_KEY`, save emails here as HTML instead of dropping them |

For the Docker stack, `docker-compose.yml` builds `DATABASE_URL` from
`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`.

## First sign-in

Log in with the seeded `SEED_ADMIN_*` credentials, then add staff from **Admin → People**
(set each person's role, line manager and department). Change your password after first sign-in.

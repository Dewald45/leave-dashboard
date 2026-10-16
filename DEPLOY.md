# Deploying (self-hosted, Docker / Portainer)

The app is a self-contained Docker image (Next.js standalone) plus a PostgreSQL
container. No Supabase, no external backend. The schema is applied automatically
on every start, so deploys are just "pull new image → recreate".

> **Who runs it:** the live server is a Portainer stack managed by Bjorn. Code
> reaches it by merging to `main` on GitHub; settings (environment variables)
> are added in the stack by Bjorn, never committed — the repo is public.

## What's in the box

- `Dockerfile` — multi-stage build → small standalone runtime; on start it runs
  `scripts/migrate.mjs` (applies `db/schema.sql`, seeds the admin once) then boots.
- `docker-compose.yml` — two services: `db` (postgres:16 + named volume
  `leave_pgdata`) and `app`.
- `.env.docker.example` — the variables to provide.

## Option A — Portainer stack from the Git repo (simplest)

1. In Portainer: **Stacks → Add stack → Git repository**.
2. Repository URL: `https://github.com/Dewald45/leave-dashboard`, ref `main`,
   compose path `docker-compose.yml`.
3. Under **Environment variables**, add the keys from `.env.docker.example`:
   - `POSTGRES_PASSWORD` (required, strong)
   - `APP_URL` = `https://leave.zenithlabs.space`
   - `RESEND_API_KEY`, `RESEND_FROM` = `TimeOff <leave@mediarocket.co.za>`
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` (first-run admin)
   - optional: `APP_PORT`, `POSTGRES_USER`, `POSTGRES_DB`
4. Deploy. Portainer builds the image and starts both containers. Point your
   existing reverse proxy / domain (leave.zenithlabs.space) at the `app` service
   on port 3000, as you already do.

To ship an update: **Pull and redeploy** the stack (Portainer rebuilds from the
latest `main`). The volume persists data; the schema step is idempotent.

## Option B — Prebuilt image from GHCR

If you'd rather not build on the server, build in CI and pull the image:

1. Add a GitHub Actions workflow that builds and pushes
   `ghcr.io/dewald45/leave-dashboard:latest` on push to `main` (happy to add this
   — just say the word).
2. In `docker-compose.yml`, comment out `build: .` under `app` and uncomment the
   `image:` line.
3. Point the Portainer stack at the compose file and enable its **webhook** so a
   new push redeploys automatically.

## Data & backups

- All data lives in the `leave_pgdata` volume. Back it up with
  `docker exec <db> pg_dump -U leave leave > backup.sql`.
- The first-run seed only creates the admin if that email doesn't already exist —
  safe to leave the `SEED_ADMIN_*` vars in place across redeploys.
- Sick notes / thread attachments and the audit trail live in the same database,
  so the `pg_dump` above backs them up too. The `audit_log` table is
  append-only by design — the database refuses to edit or delete its rows.
- Approval reminders run inside the app container every hour (no extra service
  needed). Tune with `REMINDER_AFTER_DAYS` / `ESCALATE_AFTER_DAYS`.

## Notes

- `APP_URL` must be the exact public address (`https://leave.zenithlabs.space`).
  It's used for email links, for redirects such as sign-out and Google Calendar
  (behind the proxy the app can't tell its public address on its own), and as
  the Google sign-in return address.
- `RESEND_FROM` must be on your verified Resend domain to reach all staff.
- In Cloudflare, keep **Always Use HTTPS** on so nobody signs in over plain
  `http://`. The app sends HSTS, but only once someone has reached it on https.
- Approve-from-email links are public pages (`/decide/<token>`): the token is
  the credential. They depend on `APP_URL` being right.
- Sessions are database-backed; no session secret to manage. Rotating
  `POSTGRES_PASSWORD` requires updating it in the stack env.

## Google Calendar (optional)

Lets each person click **Connect Google Calendar** on their Account page so their
leave goes straight into their own Google Calendar as an *Out of office* event
(pending until approved, removed if rejected or cancelled). Takes ~10 minutes,
done once by someone with access to Google Cloud for the `mediarocket.co.za`
Google Workspace:

1. Go to <https://console.cloud.google.com> and create a project (e.g. "TimeOff").
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **Google Auth Platform → Branding**: app name `TimeOff`, your support email.
   **Audience**: choose **Internal** (only company Workspace accounts can connect,
   and Google doesn't need to review the app).
4. **Data access → Add or remove scopes**: add
   `https://www.googleapis.com/auth/calendar.events` (plus `openid` and `email`).
   For the Gmail out-of-office option, also enable the **Gmail API** (step 2)
   and add `https://www.googleapis.com/auth/gmail.settings.basic`. Google calls
   it a *restricted* scope: fine with an **Internal** audience, but an External
   app needs Google's review first. People are only asked for it when they tick
   the Gmail option.
5. **Clients → Create client** → type **Web application**. Under
   **Authorized redirect URIs** add:
   - `https://leave.zenithlabs.space/api/google/callback`
   - `http://localhost:3000/api/google/callback` (for local testing)
6. Copy the **Client ID** and **Client secret** into the Portainer stack as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then **Pull and redeploy**.
   The button appears on everyone's Account page.

Notes:
- The redirect URI must match `APP_URL` exactly.
- Refresh tokens are stored encrypted. The key is `TOKEN_ENCRYPTION_KEY` if set,
  otherwise the client secret — rotating either means everyone reconnects.
- "Out of office" events need a Workspace calendar; a personal Gmail account
  gets an ordinary busy event instead.
- Gmail auto-replies are set as Gmail's own vacation responder, so they keep
  working if the server is down on the day. TimeOff re-checks them hourly.


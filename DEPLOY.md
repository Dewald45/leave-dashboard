# Deploying (self-hosted, Docker / Portainer)

The app is a self-contained Docker image (Next.js standalone) plus a PostgreSQL
container. No Supabase, no external backend. The schema is applied automatically
on every start, so deploys are just "pull new image → recreate".

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
   - `RESEND_API_KEY`, `RESEND_FROM` = `Leave Dashboard <leave@mediarocket.co.za>`
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

## Notes

- `APP_URL` must match the public URL (used in notification email links).
- `RESEND_FROM` must be on your verified Resend domain to reach all staff.
- Sessions are database-backed; no session secret to manage. Rotating
  `POSTGRES_PASSWORD` requires updating it in the stack env.

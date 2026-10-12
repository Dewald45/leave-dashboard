# TimeOff

A company leave-application dashboard for a South African company — annual, sick,
family-responsibility, parental/maternity and year-end-closure leave, with an
employee → line-manager approval flow and email notifications.

**Fully self-hosted**: **Next.js** (App Router, TypeScript, Tailwind) + **plain
PostgreSQL** + in-app authentication (bcrypt + database sessions). No third-party
backend — runs anywhere Docker runs.

## Leave policy encoded

| Leave type              | Allocation                                   | Notes |
| ----------------------- | -------------------------------------------- | ----- |
| Annual leave            | 15 working days/year, accrues 1.25/month     | 5 days held for the year-end closure |
| Year-end closure (paid) | 5 company-paid days                          | Auto-granted — shown, never applied for |
| Sick leave              | 30 days / 36-month cycle (BCEA)              | Throttled in the first 6 months |
| Family responsibility   | 3 days/year (BCEA)                          | After 4 months' service |
| Parental leave (fathers)| 10 days                                      | Male profiles; "speak to HR" note |
| Maternity leave (mothers)| ~4 months (≈90 working days)                | Female profiles; "speak to HR" note |

Working days exclude weekends and South African public holidays. Parental vs
maternity is scoped by the employee's `gender` on their profile.

## Architecture

- **App**: Next.js server components + server actions. Authorization is enforced
  server-side (no database RLS).
- **Auth**: `users` table (bcrypt password hashes) + `sessions` table + a signed
  HTTP-only cookie. See `src/lib/session.ts`.
- **Data**: `node-postgres` (`pg`) over `src/lib/data.ts`. Schema, business-logic
  functions and the `balance_summary` view live in [`db/schema.sql`](db/schema.sql)
  (idempotent — applied on every boot by `scripts/migrate.mjs`).
- **Email**: Resend (`src/lib/email.ts`), best-effort.

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

You need a Postgres for the app to talk to. Quickest:

```bash
cp .env.docker.example .env         # sets POSTGRES_PASSWORD for the db container
docker compose up -d db             # just Postgres, on localhost:5432
cp .env.example .env.local          # DATABASE_URL etc. (already filled for this project)
npm install
npm run db:migrate                  # apply schema + seed the admin
npm run dev                         # http://localhost:3000
```

`.env.local` is gitignored and already contains this project's local values.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | app + migrate | Postgres connection string |
| `APP_URL` | emails | Base URL for links |
| `RESEND_API_KEY` / `RESEND_FROM` | emails | Resend sender (verified domain) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | migrate | First-run admin (created once) |

For the Docker stack, `docker-compose.yml` builds `DATABASE_URL` from
`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`.

## First sign-in

Log in with the seeded `SEED_ADMIN_*` credentials, then add staff from **Admin**
(set each person's role, line manager, department and **gender** so they get the
right parental/maternity leave). Change your password after first sign-in.

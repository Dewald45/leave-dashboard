# TimeOff (leave-dashboard)

Media Rocket's leave dashboard: Next.js 14 (App Router, server actions,
Tailwind) + plain PostgreSQL, self-hosted with Docker. Live at
https://leave.zenithlabs.space. Repo: https://github.com/Dewald45/leave-dashboard.

## Where to work

- **Work Mac mini:** `~/Developer/leave-dashboard`. Homebrew and the GitHub CLI
  are installed; `gh` is signed in as `jordi-jordds`, so `git push` and
  `gh pr create` just work. No Docker — use `npm run db:local`.
- **Not** the old copy in Google Drive (`2_Claude/01_Active/TImeOFF`): Drive
  sync breaks git and makes builds take minutes. It's an archive only.

## Commands

```bash
npm install
cp .env.example .env.local   # first time only
npm run db:local             # local database (PGlite) on :5432 — leave running
npm run db:migrate           # apply db/schema.sql + seed the admin
npm run dev                  # http://localhost:3000
npx tsc --noEmit             # type-check
npx next build               # production build check
```

Sign in locally with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from
`.env.local`. Set `EMAIL_OUTBOX_DIR=./email-outbox` to see emails as HTML files
instead of sending them.

## Releasing

1. Branch off `main`, commit, push, open a PR on `Dewald45/leave-dashboard`.
2. Add a plain-English entry to `CHANGELOG.md` (newest first), including a
   "Needs attention when deploying" list when something has to be done on the
   server.
3. Merge to `main`.
4. The server (Portainer, managed by **Bjorn**) pulls `main` and redeploys.
   The database updates itself on boot (`scripts/migrate.mjs`). New server
   settings (environment variables) have to be added there by Bjorn.

## Rules

- **The repo is public.** Never commit secrets: `.env*`, passwords, API keys,
  the Google OAuth client JSON. Server secrets live in the Portainer stack
  (`RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, …).
- **Schema** (`db/schema.sql`) runs on every boot, so every change must be
  idempotent and additive (`create … if not exists`, `add column if not
  exists`, `create or replace`). Test it twice in a row on a fresh database
  *and* on top of the current `main` schema.
- **Audit trail:** every action that changes data must call `audit()`
  (`src/lib/audit.ts`). `audit_log` is append-only by design.
- **Leave rules** are the company's reading of the BCEA — check with Jono
  (HR) before changing them.
- **Leave defaults** (days per type) are owned by the Admin page, not code;
  the seed only sets them for brand-new leave types.
- **Design:** new UI goes through the `ui-ux-pro-max` skill first and follows
  the existing look — rounded-3xl white cards on the sand background, pill
  buttons, sentence-case headings, `PageHeader` at the top of each page.

## Open items

- Parental leave: update for the BCEA shared-parental-leave changes once Jono
  has explained what the company is adopting.
- Google Calendar sync is tested against a local stand-in only; first real
  test once `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are on the server
  (Google Cloud project `timeoff-511710`, Internal). Plain-Gmail fallback is
  untested.
- Real email delivery through Resend hasn't been verified end to end.

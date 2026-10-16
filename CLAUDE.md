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
- **One screen on laptops:** wrap pages in `ScreenPage` and put long content in
  a `Panel` (or anything with `fit:min-h-0 fit:flex-1 fit:overflow-y-auto`) so
  the page never scrolls from 1024×640 up (`fit` breakpoint in
  `tailwind.config.ts`). Side-by-side panels sit in a grid with
  `fit:grid-rows-[minmax(0,1fr)]`. Check new pages at 1280×680 (no page
  scroll) and 375 wide (normal scroll, nothing sideways).
  For laptops that are wide but not tall (under 800px), the `short:` variant
  tightens spacing (used on the dashboard). Pin a long form's submit row to
  the bottom of its scrolling card so it never hides below the fold.
- **Redirects** from route handlers use `publicUrl()` (`src/lib/publicUrl.ts`),
  never `request.url` — behind the proxy that's `0.0.0.0:3000`.

## Open items

- Parental leave: update for the BCEA shared-parental-leave changes once Jono
  has explained what the company is adopting.
- Google Calendar: the settings are on the server and the real Google sign-in
  works; the return trip failed on the `0.0.0.0` redirect bug (fixed in PR #4,
  waiting on Bjorn's redeploy). After that: connect, submit a test request,
  confirm the Out of office block. Plain-Gmail fallback is untested.
- Real email delivery through Resend hasn't been verified end to end.

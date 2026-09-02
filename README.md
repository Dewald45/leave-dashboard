# Leave Dashboard

A company leave-application dashboard for a South African company — annual, sick,
and family-responsibility leave with an employee → line-manager approval flow, and
built-in handling of the **year-end closure** (5 days from annual leave + 5
company-paid days).

Built with **Next.js (App Router, TypeScript, Tailwind)** and **Supabase**
(Postgres, Auth, Row-Level Security).

## Leave policy encoded

| Leave type              | Allocation                        | Notes                                             |
| ----------------------- | --------------------------------- | ------------------------------------------------- |
| Annual leave            | 15 working days / year            | 5 days reserved for the year-end closure          |
| Year-end closure (paid) | 5 company-paid days               | Do **not** reduce the annual balance              |
| Sick leave              | 30 days / 36-month cycle (BCEA)   |                                                   |
| Family responsibility   | 3 days / year (BCEA)              |                                                   |

Working days are calculated automatically, excluding weekends and South African
public holidays (see `src/lib/leave.ts`).

## Roles & approval flow

- **Employee** — applies for leave, sees own balances and requests.
- **Manager** — everything above, plus approves/rejects their direct reports'
  requests and sees their team.
- **Admin (HR)** — full oversight: create staff, set roles and reporting lines,
  adjust allocations, approve anything.

An employee submits a request → it appears in their line manager's **Approvals**
queue → the manager approves or rejects (optionally with a note). Balance checks
and an approval-guard database trigger enforce the rules server-side.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template and fill it in from your Supabase project
   (Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

   `.env.local` is gitignored and already populated for this project.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Database

The schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
and is already applied to the Supabase project. It contains:

- `profiles`, `leave_types`, `leave_balances`, `leave_requests`
- `balance_summary` view (used/pending/available per person per type)
- Row-Level Security on every table
- `handle_new_user` trigger — auto-provisions a profile + balances on signup
  (the **first** user becomes admin)
- `guard_request_change` trigger — only a line manager or admin can approve/reject

To re-apply on a fresh project, run the SQL in the Supabase SQL editor.

## First sign-in

The first account created becomes the **admin**. From **Admin** you can add the
rest of your staff (each gets a temporary password to share securely), set their
managers, and adjust allocations.

## Deploy

Deploy to Vercel and set the same three environment variables. Point the Supabase
project's Auth → URL configuration at your deployed URL.

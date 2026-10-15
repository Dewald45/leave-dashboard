# Changelog

What changed in TimeOff, newest first.

## 2026-10-15

### Talk about a request
- Every request has its own page (`/requests/<id>`) with a conversation between
  the employee, their manager and anyone else involved. Each post emails the
  others. Request lists show a chat button with an unread dot.
- Files can be attached in the conversation.

### Sick notes and half days
- Sick leave longer than 2 days needs a medical certificate (PDF or photo, up
  to 5 MB) when applying. It can also be added later in the conversation.
  Only people who can see the request can open it.
- A single day can be booked as a morning or afternoon (half a day).

### Calendar
- Submitting leave emails you an out-of-office event for your calendar. It
  confirms itself when approved and disappears if rejected or cancelled.
  Outlook shows it as "Out of office"; Google Calendar shows a busy block.
- The new Account page has a personal calendar link to subscribe to. Managers'
  calendars include their team's approved leave.

### Approvals
- Approvers get a reminder after 3 days; after 5 days the request goes to the
  manager's backup approver, or the admins if none is set.
- While a manager is on leave, their backup approver can approve for them.
  Managers choose a backup on the Account page; admins can set it per person.
- Employees can now cancel approved leave as well as pending requests.

### Admin
- CSV exports: monthly leave taken per person (for payroll), all requests, and
  balances including carry-over.
- Public holidays are edited on the Admin page instead of in code.
- **Audit trail** (Admin → Audit trail): every submission, approval,
  rejection, cancellation, escalation, profile/role change, balance edit,
  deletion, holiday change, password event and sign-in, with who, when,
  before/after values and IP. Filter and download as CSV. Entries can't be
  edited or deleted, and they stay after an employee is removed.

### Public holidays update themselves
- South African public holidays are now calculated from the Public Holidays Act
  (the fixed days, Good Friday and Family Day from Easter, and a Sunday holiday
  moving to Monday — or the next free day, as with 27 December in 2016 and
  2022). Last year, this year and the next two are always filled in; new years
  appear on their own. Admins only add specially declared days, like elections.
- Holidays an admin removes stay removed. Added-by-admin days are labelled.

### Public holiday reminder emails
- A week before each public holiday everyone gets a heads-up to plan work
  around it, their annual leave left, and — when a Tuesday or Thursday holiday
  makes a 4-day weekend possible — a one-click link to book the bridge day
  (`/apply?type=&start=&end=` now prefills the form).
- Sent once per holiday, during working hours. Anyone can turn these off on
  their Account page.

### Leave allowances per person
- **Company leave defaults** (Admin): set how many days a year everyone gets per
  leave type, and how many annual days are held for the closure. Used for new
  employees and each new leave year; balances already running aren't changed.
  These defaults now survive redeploys (they used to be reset from code on
  every boot).
- **Add employee** shows each leave type prefilled with the company default
  (parental vs maternity follows the gender picked) and can be changed for that
  person. Their own numbers carry into every future leave year.
- On an employee's allocations, **"Also use this for future leave years"** makes
  a change permanent for that person instead of just this leave year.

### Accounts
- "Forgot it?" on the sign-in page emails a one-time reset link (1 hour).
- Change your password on the Account page; other devices are signed out.

### Needs attention when deploying
- On first boot the audit trail is started and existing requests' history is
  rebuilt from their records (submitted and decided). Cancellation times were
  never stored, so those aren't backfilled.
- Public holidays fill in automatically on first boot (last year through two
  years ahead). Election days and other declared holidays still need adding.
- The first holiday reminder goes out a week before 16 December.
- `RESEND_API_KEY` must be set for any of the new emails (threads, invites,
  reminders, password resets) to go out.
- Optional new settings: `REMINDER_AFTER_DAYS`, `ESCALATE_AFTER_DAYS`,
  `HOLIDAY_REMINDER_DAYS`, `REMINDERS`, `CRON_SECRET` (see `.env.docker.example`).
- Company leave defaults now live in the database. If someone changes a
  default in `db/schema.sql` later, it only applies to brand-new leave types —
  change existing ones on the Admin page.
- For local testing without Resend, set `EMAIL_OUTBOX_DIR` to a folder and every
  email is saved there as an HTML file instead.

## 2026-10-12

### Renamed to TimeOff
- New "timeoff" wordmark (lowercase Rubik ExtraBold with an orange "off" tag) in
  the app and login page, and a matching favicon. Artwork is in `public/brand`.
- "Leave Dashboard" became "TimeOff" in the page title, emails, sender name,
  README, `.env` examples and `docker-compose.yml`. The repo and package are
  still called `leave-dashboard`.

### New look
- The dark top bar was replaced by a left sidebar of pill-shaped nav items that
  collapses to icons. On phones it is a floating bottom tab bar with Apply as
  the raised button in the middle.
- The app sits in one rounded shell on a grey page, with borderless rounded
  cards, pill buttons and plain page titles instead of black banners.
- Leave balance cards are pastel tints of each leave colour. Leave that is
  still locked shows as a grey card.
- The dashboard is a single-screen bento on laptops and larger (1024px wide,
  640px tall): greeting and closure, one card per leave type, recent requests.
  Smaller screens stack and scroll.

### Later the same day
- Pages fill the full width of the shell (the 5xl cap is gone). The apply page
  gained a "What you have left" panel beside the form.
- On phones the raised + opens a menu: apply for a specific leave type, and for
  managers and admins, review requests, see who's off and add an employee.
  `/apply?type=<id>` preselects a leave type.
- Team now lives under Approvals: the two pages share sub-tabs and one nav item.
- Request lists on phones and the dashboard history are a compact list with a
  date chip instead of a table; the team list is cards on phones.

### Leave rules
- **Leave years run from each employee's start date** instead of the calendar
  year, for annual, sick and family-responsibility leave.
- **Booking ahead of accrual is allowed** (arrears), capped at the leave year's
  maximum. The 5 days held for the December closure are reserved from day one
  and can never be booked.
- **Carry-over with a six-month expiry.** Unused bookable annual leave carries
  into the next leave year and expires six months in. Admins can correct each
  person's carried-over days on the Admin page.
- **Expiry reminder emails** to the employee at 90, 30 and 7 days before
  carried-over leave expires.

### Clearer numbers
- Sick leave shows the full 30-day cycle total, with how much is unlocked
  during the first six months, instead of the capped figure.
- The apply form shows days in hand and days left after the request, the
  confirmation repeats it, and balance cards count pending requests.
- The year-end closure is explained in plain English on the dashboard: +5 days
  gifted by the company, −5 days taken from annual leave.

### Fixed
- Saving a new employee's sick leave on the Admin page no longer overwrites
  their allocation with the first-six-months cap.
- Balances are found by the leave cycle in progress rather than the calendar
  year, so sick leave no longer disappears for cycles that began in an earlier year.

### Needs attention when deploying
- Existing annual balances were stored against the calendar year. After this
  release each record belongs to the leave year that starts in that year, so
  some people's remaining days will change. Check them after deploying.
- Everyone starts with zero carried-over days; enter real figures on the Admin
  page if anyone is owed leave from a previous year.
- The reminder emails have not been sent for real yet — only tested up to the
  point of sending. Test once with `RESEND_API_KEY` set.
- `next.config.mjs` now enables the instrumentation hook, which the reminders
  depend on.

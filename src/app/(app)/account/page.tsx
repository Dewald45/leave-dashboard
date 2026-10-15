import { requireProfile } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { getManagersAndAdmins } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import CopyField from "@/components/CopyField";
import ChangePasswordForm from "./ChangePasswordForm";
import { rotateCalendarToken, setBackupApprover, setHolidayEmails } from "./actions";

function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

const card = "rounded-3xl bg-white p-6";
const heading = "text-lg font-semibold text-ink-900";

export default async function AccountPage() {
  const { profile } = await requireProfile();
  const isManager = profile.role === "manager" || profile.role === "admin";

  const [extras, approvers] = await Promise.all([
    q1<{ calendar_token: string | null; backup_approver_id: string | null; holiday_emails: boolean }>(
      "select calendar_token, backup_approver_id, holiday_emails from profiles where id = $1",
      [profile.id]
    ),
    isManager ? getManagersAndAdmins() : Promise.resolve([]),
  ]);
  const feedUrl = extras?.calendar_token
    ? `${appUrl()}/api/calendar/${extras.calendar_token}.ics`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Your account">
        {profile.full_name} · {profile.email}
      </PageHeader>

      {/* Calendar */}
      <section className={card} aria-labelledby="cal-heading">
        <h2 id="cal-heading" className={heading}>Calendar</h2>
        <p className="mt-2 text-sm text-ink-800">
          Every request you submit is emailed to you as an out-of-office event. For
          something that keeps itself up to date, subscribe to your TimeOff calendar
          {isManager ? " — it includes your team's approved leave too" : ""}.
        </p>

        {feedUrl ? (
          <div className="mt-4 space-y-3">
            <CopyField value={feedUrl} label="Calendar subscription link" />
            <ul className="space-y-1 text-xs text-sand-600">
              <li><strong className="text-ink-800">Google Calendar:</strong> Other calendars → + → From URL → paste.</li>
              <li><strong className="text-ink-800">Outlook:</strong> Add calendar → Subscribe from web → paste.</li>
              <li><strong className="text-ink-800">Apple Calendar:</strong> File → New Calendar Subscription → paste.</li>
            </ul>
            <p className="text-xs text-sand-500">
              Treat this link like a password — anyone with it can see the calendar. Calendar
              apps refresh subscriptions every few hours.
            </p>
            <form action={rotateCalendarToken}>
              <button
                type="submit"
                className="min-h-[40px] rounded-full border border-sand-300 px-4 text-sm font-medium text-sand-600 hover:bg-sand-50"
              >
                Replace link (old one stops working)
              </button>
            </form>
          </div>
        ) : (
          <form action={rotateCalendarToken} className="mt-4">
            <button
              type="submit"
              className="min-h-[40px] rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Create my calendar link
            </button>
          </form>
        )}
      </section>

      {/* Holiday reminders */}
      <section className={card} aria-labelledby="holiday-heading">
        <h2 id="holiday-heading" className={heading}>Public holiday reminders</h2>
        <form action={setHolidayEmails} className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-ink-800">
            <input
              type="checkbox"
              name="holiday_emails"
              defaultChecked={extras?.holiday_emails ?? true}
              className="mt-0.5 h-5 w-5 rounded border-sand-300 accent-ink-900"
            />
            <span>
              Email me a week before each public holiday, with a heads-up for work and a
              suggested day to take off when there&apos;s a long weekend to be had.
            </span>
          </label>
          <button
            type="submit"
            className="min-h-[40px] rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Save
          </button>
        </form>
      </section>

      {/* Backup approver */}
      {isManager ? (
        <section className={card} aria-labelledby="backup-heading">
          <h2 id="backup-heading" className={heading}>While you&apos;re away</h2>
          <p className="mt-2 text-sm text-ink-800">
            Pick a stand-in. While you&apos;re on approved leave — or if a request waits more
            than 5 days — they can approve your team&apos;s requests. With nobody picked,
            the admins cover for you.
          </p>
          <form action={setBackupApprover} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor="backup_approver_id" className="mb-1 block text-sm font-medium text-ink-800">
                Backup approver
              </label>
              <select
                id="backup_approver_id"
                name="backup_approver_id"
                defaultValue={extras?.backup_approver_id ?? ""}
                className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">— Nobody (admins cover) —</option>
                {approvers
                  .filter((a) => a.id !== profile.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
              </select>
            </div>
            <button
              type="submit"
              className="min-h-[40px] rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Save
            </button>
          </form>
        </section>
      ) : null}

      {/* Password */}
      <section className={card} aria-labelledby="pw-heading">
        <h2 id="pw-heading" className={`${heading} mb-4`}>Password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}

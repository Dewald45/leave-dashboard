import { requireProfile } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { getManagersAndAdmins } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import ChangePasswordForm from "./ChangePasswordForm";
import InstallApp from "@/components/InstallApp";
import {
  disconnectGoogleCalendar,
  setBackupApprover,
  setGmailAutoReply,
  setHolidayEmails,
} from "./actions";
import { getGoogleLink, isGoogleConfigured } from "@/lib/googleCalendar";

const GOOGLE_MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Google Calendar connected. Your upcoming leave is already in it." },
  declined: { tone: "warn", text: "No problem — Google Calendar wasn't connected." },
  failed: { tone: "warn", text: "Couldn't connect Google Calendar. Please try again." },
  unavailable: { tone: "warn", text: "Google Calendar isn't switched on for TimeOff yet — ask an admin." },
  gmail_on: { tone: "ok", text: "Gmail auto-reply is on. It switches itself on for your next approved leave." },
  gmail_declined: { tone: "warn", text: "Gmail wasn't given permission, so the auto-reply stays off. Your calendar is still connected." },
};

const card = "rounded-3xl bg-white p-6";
const heading = "text-lg font-semibold text-ink-900";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { google?: string };
}) {
  const { profile } = await requireProfile();
  const isManager = profile.role === "manager" || profile.role === "admin";

  const [extras, approvers] = await Promise.all([
    q1<{ backup_approver_id: string | null; holiday_emails: boolean }>(
      "select backup_approver_id, holiday_emails from profiles where id = $1",
      [profile.id]
    ),
    isManager ? getManagersAndAdmins() : Promise.resolve([]),
  ]);
  const googleOn = isGoogleConfigured();
  const googleLink = googleOn ? await getGoogleLink(profile.id) : null;
  const googleMsg = searchParams.google ? GOOGLE_MESSAGES[searchParams.google] : undefined;

  return (
    <ScreenPage>
      <PageHeader title="Your account">
        {profile.full_name} · {profile.email}
      </PageHeader>

      {googleMsg ? (
        <div
          role="status"
          className={`rounded-3xl px-6 py-4 text-sm ${
            googleMsg.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          {googleMsg.text}
        </div>
      ) : null}

      <div className="grid items-start gap-4 fit:min-h-0 fit:flex-1 lg:grid-cols-2 fit:grid-rows-[minmax(0,1fr)]">
      {/* Left: Google Calendar and reminders */}
      <div className="space-y-4 fit:max-h-full fit:overflow-y-auto">
      {/* Google Calendar */}
      {googleOn ? (
        <section className={card} aria-labelledby="google-heading">
          <h2 id="google-heading" className={heading}>Google Calendar</h2>
          {googleLink ? (
            <>
              <p className="mt-2 text-sm text-ink-800">
                Connected as <strong>{googleLink.google_email}</strong>. When you apply, your
                leave goes straight into your calendar as <strong>Out of office</strong> —
                marked pending until it&apos;s approved, and removed if it&apos;s rejected or
                cancelled. Meetings booked over it are declined for you.
              </p>
              {/* Gmail auto-reply (needs one extra Google permission) */}
              <div className="mt-5 border-t border-sand-100 pt-4">
                <h3 className="text-sm font-semibold text-ink-900">Gmail auto-reply</h3>
                {googleLink.gmail_allowed ? (
                  <form action={setGmailAutoReply} className="mt-2 space-y-3">
                    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-ink-800">
                      <input
                        type="checkbox"
                        name="gmail_reply_on"
                        defaultChecked={googleLink.gmail_reply_on}
                        className="mt-0.5 h-5 w-5 rounded border-sand-300 accent-ink-900"
                      />
                      <span>
                        Switch on my Gmail out-of-office reply during approved leave, and off
                        again when I&apos;m back. Half days are skipped.
                      </span>
                    </label>
                    <div>
                      <label htmlFor="gmail-reply-message" className="mb-1 block text-sm font-medium text-ink-800">
                        Message <span className="font-normal text-sand-500">(optional)</span>
                      </label>
                      <textarea
                        id="gmail-reply-message"
                        name="gmail_reply_message"
                        rows={3}
                        maxLength={2000}
                        defaultValue={googleLink.gmail_reply_message ?? ""}
                        placeholder="Leave blank for: Thanks for your email. I'm on leave and back on <date>. I'll reply when I'm back."
                        className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </div>
                    <button
                      type="submit"
                      className="min-h-[40px] rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-ink-800">
                      Let TimeOff switch on your Gmail out-of-office reply while you&apos;re on
                      approved leave, and off when you&apos;re back. Google will ask for
                      permission to change your Gmail settings; TimeOff only touches the
                      auto-reply.
                    </p>
                    <a
                      href="/api/google/connect?gmail=1"
                      className="mt-3 inline-flex min-h-[44px] items-center rounded-full border border-sand-300 px-5 text-sm font-semibold text-ink-900 hover:bg-sand-50"
                    >
                      Turn on Gmail auto-reply
                    </a>
                  </>
                )}
              </div>

              <form action={disconnectGoogleCalendar} className="mt-4">
                <button
                  type="submit"
                  className="min-h-[40px] rounded-full border border-sand-300 px-4 text-sm font-medium text-sand-600 hover:bg-sand-50"
                >
                  Disconnect Google Calendar
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-800">
                Put your leave straight into your own Google Calendar as an
                <strong> Out of office</strong> block — no invites to accept. Google will ask
                you to allow TimeOff to manage events in your calendar; it only touches the
                leave events it creates.
              </p>
              <a
                href="/api/google/connect"
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
                  <path d="M8 2.5v4M16 2.5v4M3 10h18" />
                </svg>
                Connect Google Calendar
              </a>
            </>
          )}
        </section>
      ) : null}

      {/* Home-screen app */}
      <section className={card} aria-labelledby="app-heading">
        <h2 id="app-heading" className={heading}>TimeOff on your phone</h2>
        <InstallApp />
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

      </div>

      {/* Right: approvals stand-in and password */}
      <div className="space-y-4 fit:max-h-full fit:overflow-y-auto">
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
      </div>
    </ScreenPage>
  );
}

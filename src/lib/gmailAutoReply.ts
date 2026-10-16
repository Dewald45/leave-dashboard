import "server-only";
import { q, q1 } from "@/lib/db";
import { accessToken, GMAIL_SCOPE, isGoogleConfigured } from "@/lib/googleCalendar";
import { getHolidaySet } from "@/lib/holidays";
import { formatDate, isWeekendOrHoliday } from "@/lib/leave";

/**
 * Gmail's own "vacation responder", switched on for the person's next approved
 * leave (opt-in on Account, needs the gmail.settings.basic permission).
 *
 * Gmail only has one auto-reply at a time, so TimeOff points it at the next
 * approved leave that hasn't finished yet; Gmail itself starts and stops
 * replying at the window's edges. The window TimeOff set is remembered so it
 * only ever switches off a reply it put there, never one the person set up
 * themselves. Best-effort: never throws.
 */

const API_BASE = process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
const VACATION_URL = `${API_BASE}/gmail/v1/users/me/settings/vacation`;
/** South Africa is UTC+2 all year (no daylight saving). */
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

type Link = {
  profile_id: string;
  scopes: string;
  gmail_reply_on: boolean;
  gmail_reply_message: string | null;
  gmail_reply_request: string | null;
  gmail_reply_start: string | null; // bigint comes back as text
  gmail_reply_end: string | null;
};

const startOfDay = (iso: string) => Date.parse(iso + "T00:00:00Z") - SAST_OFFSET_MS;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

async function firstDayBack(endDate: string): Promise<string> {
  const holidays = await getHolidaySet();
  let d = addDays(endDate, 1);
  for (let i = 0; i < 30 && isWeekendOrHoliday(d, holidays); i++) d = addDays(d, 1);
  return d;
}

function defaultMessage(name: string, back: string) {
  return (
    `Hi,\n\nThanks for your email. I'm on leave and back on ${formatDate(back)}. ` +
    `I'll reply when I'm back.\n\n${name}`
  );
}

async function putVacation(token: string, body: Record<string, unknown>) {
  const res = await fetch(VACATION_URL, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("[gmail] vacation update failed", res.status, await res.text());
  return res.ok;
}

async function getLink(profileId: string) {
  return q1<Link>(
    `select profile_id, scopes, gmail_reply_on, gmail_reply_message, gmail_reply_request,
            gmail_reply_start::text, gmail_reply_end::text
       from google_calendar_links where profile_id = $1`,
    [profileId]
  );
}

/** Switch off the auto-reply if (and only if) it's still the one TimeOff set. */
export async function stopOurAutoReply(profileId: string): Promise<void> {
  if (!isGoogleConfigured()) return;
  const link = await getLink(profileId);
  if (!link?.gmail_reply_request || !link.scopes.includes(GMAIL_SCOPE)) return;
  const token = await accessToken(profileId);
  if (!token) return;
  try {
    const res = await fetch(VACATION_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const cur = (await res.json()) as { enableAutoReply?: boolean; startTime?: string; endTime?: string };
      const ours =
        cur.enableAutoReply &&
        cur.startTime === link.gmail_reply_start &&
        cur.endTime === link.gmail_reply_end;
      if (ours) await putVacation(token, { enableAutoReply: false });
    }
  } catch (err) {
    console.error("[gmail] couldn't check the current auto-reply:", err);
  }
  await q(
    `update google_calendar_links
        set gmail_reply_request = null, gmail_reply_start = null, gmail_reply_end = null
      where profile_id = $1`,
    [profileId]
  );
}

/**
 * Point the person's Gmail auto-reply at their next approved full-day leave,
 * or switch TimeOff's one off when there's none. `force` re-sends it even if
 * the window hasn't changed (after the message is edited).
 */
export async function syncGmailAutoReply(profileId: string, force = false): Promise<void> {
  if (!isGoogleConfigured()) return;
  try {
    const link = await getLink(profileId);
    if (!link || !link.scopes.includes(GMAIL_SCOPE)) return;
    if (!link.gmail_reply_on) {
      await stopOurAutoReply(profileId);
      return;
    }

    // Half days are skipped: an auto-reply for a morning off would confuse people.
    const next = await q1<{ id: string; start_date: string; end_date: string; full_name: string }>(
      `select r.id, r.start_date::text as start_date, r.end_date::text as end_date, p.full_name
         from leave_requests r join profiles p on p.id = r.profile_id
        where r.profile_id = $1 and r.status = 'approved' and r.half_day is null
          and r.end_date >= (now() at time zone 'Africa/Johannesburg')::date
        order by r.start_date asc limit 1`,
      [profileId]
    );
    if (!next) {
      await stopOurAutoReply(profileId);
      return;
    }

    const start = String(startOfDay(next.start_date));
    const end = String(startOfDay(addDays(next.end_date, 1)) - 1);
    const same =
      link.gmail_reply_request === next.id &&
      link.gmail_reply_start === start &&
      link.gmail_reply_end === end;
    if (same && !force) return;

    const token = await accessToken(profileId);
    if (!token) return;
    const back = await firstDayBack(next.end_date);
    const ok = await putVacation(token, {
      enableAutoReply: true,
      responseSubject: "Out of office",
      responseBodyPlainText:
        link.gmail_reply_message?.trim() || defaultMessage(next.full_name, back),
      restrictToContacts: false,
      restrictToDomain: false,
      startTime: start,
      endTime: end,
    });
    if (!ok) return;
    await q(
      `update google_calendar_links
          set gmail_reply_request = $2, gmail_reply_start = $3, gmail_reply_end = $4
        where profile_id = $1`,
      [profileId, next.id, start, end]
    );
  } catch (err) {
    console.error("[gmail] auto-reply sync failed:", err);
  }
}

/** Hourly sweep: when one leave ends, line the auto-reply up for the next. */
export async function syncAllGmailAutoReplies(): Promise<number> {
  if (!isGoogleConfigured()) return 0;
  const rows = await q<{ profile_id: string }>(
    "select profile_id from google_calendar_links where gmail_reply_on or gmail_reply_request is not null"
  );
  for (const r of rows) await syncGmailAutoReply(r.profile_id);
  return rows.length;
}

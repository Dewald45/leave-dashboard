import "server-only";
import { q, q1 } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyUpcomingHolidays } from "@/lib/email";

/** Email everyone this many days ahead of a public holiday. */
const DAYS_AHEAD = Number(process.env.HOLIDAY_REMINDER_DAYS) || 7;
/** Only send during the working day (South African time). */
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 17;

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dow = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay(); // 0 Sun … 6 Sat

const shortDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });

/** Tuesday holiday → Monday is a bridge day; Thursday → Friday. */
function bridgeDayFor(holiday: string): string | null {
  if (dow(holiday) === 2) return addDays(holiday, -1);
  if (dow(holiday) === 4) return addDays(holiday, 1);
  return null;
}

/** "Long weekend" / "Mid-week" style note for the email list. */
function noteFor(holiday: string): string | null {
  if (dow(holiday) === 1 || dow(holiday) === 5) return "long weekend";
  return null;
}

/** Keep the next few years of public holidays filled in (cheap; idempotent). */
export async function ensureHolidays() {
  await q("select public.ensure_sa_holidays(extract(year from current_date)::int - 1, 4)");
}

export async function runHolidayReminders(): Promise<{ holidays: number; emails: number }> {
  const hour = await q1<{ h: number }>(
    "select extract(hour from now() at time zone 'Africa/Johannesburg')::int as h"
  );
  if (!hour || hour.h < SEND_FROM_HOUR || hour.h >= SEND_UNTIL_HOUR) return { holidays: 0, emails: 0 };

  // Claim upcoming weekday holidays not yet announced (so overlapping runs
  // can't double-send). Weekend holidays are skipped: the observed Monday is
  // the one that matters for work.
  const claimed = await q<{ holiday_date: string; name: string }>(
    `with upcoming as (
       select holiday_date, name from public_holidays
        where holiday_date between current_date + 1 and current_date + $1::int
          and extract(isodow from holiday_date) < 6
     ), ins as (
       insert into holiday_reminders (holiday_date)
       select holiday_date from upcoming
       on conflict (holiday_date) do nothing
       returning holiday_date
     )
     select u.holiday_date::text as holiday_date, u.name
       from upcoming u join ins using (holiday_date)
      order by u.holiday_date`,
    [DAYS_AHEAD]
  );
  if (claimed.length === 0) return { holidays: 0, emails: 0 };

  const allHolidays = new Set(
    (await q<{ d: string }>("select holiday_date::text as d from public_holidays")).map((r) => r.d)
  );
  const annual = await q1<{ id: number }>("select id from leave_types where code = 'annual'");
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  // A bridge day must itself be a working day.
  const bridgeCandidates = claimed
    .map((h) => ({ holiday: h, day: bridgeDayFor(h.holiday_date) }))
    .filter((b): b is { holiday: typeof claimed[number]; day: string } =>
      !!b.day && dow(b.day) > 0 && dow(b.day) < 6 && !allHolidays.has(b.day)
    );

  const people = await q<{
    id: string; full_name: string; email: string; annual_left: number | null;
  }>(
    `select p.id, p.full_name, p.email,
            (select (b.available_days - b.pending_days)::float8 from balance_summary b
              where b.profile_id = p.id and b.leave_code = 'annual' and b.is_current
              limit 1) as annual_left
       from profiles p
      where p.holiday_emails`
  );

  let emails = 0;
  for (const person of people) {
    // Suggest a bridge day only if they aren't already off that day.
    let bridge: { date: string; label: string; href: string } | null = null;
    for (const b of bridgeCandidates) {
      const busy = await q1(
        `select 1 from leave_requests where profile_id = $1 and status in ('pending','approved')
            and $2::date between start_date and end_date`,
        [person.id, b.day]
      );
      if (!busy) {
        bridge = {
          date: b.day,
          label: `take ${shortDay(b.day)} off and turn ${b.holiday.name} into a 4-day weekend for just 1 day of leave.`,
          href: `${appUrl}/apply?${annual ? `type=${annual.id}&` : ""}start=${b.day}&end=${b.day}`,
        };
        break;
      }
    }
    const ok = await notifyUpcomingHolidays({
      to: person.email,
      name: person.full_name,
      holidays: claimed.map((h) => ({ date: h.holiday_date, name: h.name, note: noteFor(h.holiday_date) })),
      bridge,
      annualLeft: person.annual_left,
    });
    if (ok) emails++;
  }

  await q("update holiday_reminders set recipients = $1 where holiday_date = any($2::date[])", [
    people.length,
    claimed.map((h) => h.holiday_date),
  ]);
  await audit({
    action: "holiday.reminder_sent",
    entityType: "holiday",
    entityId: claimed.map((h) => h.holiday_date).join(","),
    summary: `Emailed ${people.length} people about ${claimed.map((h) => h.name).join(", ")}`,
    details: { holidays: claimed, recipients: people.length, delivered: emails },
  });
  return { holidays: claimed.length, emails };
}

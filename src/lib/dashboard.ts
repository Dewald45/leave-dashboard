/**
 * Dashboard helpers: the year-at-a-glance strip and the "take a break" nudge.
 * Plain functions over already-loaded rows, so they're easy to reason about.
 */
import type { PublicHoliday, RequestWithRelations } from "@/lib/types";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const parse = (s: string) => Date.parse(s + "T00:00:00Z");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DayKind = "out" | "free" | "holiday" | "taken" | "booked" | "pending";
export type StripDay = { date: string; kind: DayKind; today: boolean; note: string };
export type StripWeek = { label: string; days: StripDay[] };

/**
 * One column per week (Mon–Fri) from cycleStart to cycleEnd. Weekends are
 * left out: they never cost leave. Request days win over holidays because a
 * holiday inside a request isn't charged anyway.
 */
export function buildYearStrip(
  cycleStart: string,
  cycleEnd: string,
  today: string,
  requests: RequestWithRelations[],
  holidays: PublicHoliday[]
): StripWeek[] {
  const holidayName = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const status = new Map<string, { kind: DayKind; note: string }>();
  for (const r of requests) {
    if (r.status !== "approved" && r.status !== "pending") continue;
    const kind: DayKind =
      r.status === "pending" ? "pending" : r.end_date < today ? "taken" : "booked";
    const name = r.leave_types?.name ?? "Leave";
    for (let t = parse(r.start_date); t <= parse(r.end_date); t += DAY) {
      status.set(iso(t), { kind, note: `${name} (${kind})` });
    }
  }

  const start = parse(cycleStart);
  const end = parse(cycleEnd);
  // Back up to the Monday of the first week.
  let monday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;
  const weeks: StripWeek[] = [];
  let lastMonth = -1;
  while (monday <= end) {
    let label = "";
    const days: StripDay[] = [];
    for (let i = 0; i < 5; i++) {
      const t = monday + i * DAY;
      const date = iso(t);
      const inCycle = t >= start && t <= end;
      const month = new Date(t).getUTCMonth();
      if (inCycle && month !== lastMonth) {
        lastMonth = month;
        label = MONTHS[month];
      }
      const hit = status.get(date);
      const hol = holidayName.get(date);
      days.push({
        date,
        today: date === today,
        kind: !inCycle ? "out" : hit ? hit.kind : hol ? "holiday" : "free",
        note: hit?.note ?? hol ?? "",
      });
    }
    weeks.push({ label, days });
    monday += 7 * DAY;
  }
  return weeks;
}

export type Nudge = {
  monthsSince: number;
  holiday: PublicHoliday;
  start: string;
  end: string;
  cost: number;
  breakDays: number;
};

/**
 * Suggest a cheap long weekend when someone hasn't had leave for 3+ months:
 * the next public holiday in the coming 90 days that a day or two of leave
 * turns into a long weekend.
 */
export function findNudge(
  today: string,
  requests: RequestWithRelations[],
  holidays: PublicHoliday[],
  joined: string | null
): Nudge | null {
  const lastOff = requests
    .filter((r) => r.status === "approved" && r.start_date <= today)
    .map((r) => (r.end_date < today ? r.end_date : today))
    .sort()
    .pop();
  const since = lastOff ?? joined;
  if (!since) return null;
  const monthsSince = Math.floor((parse(today) - parse(since)) / (30.44 * DAY));
  if (monthsSince < 3) return null;
  // Already have something coming up? No nudge needed.
  if (requests.some((r) => (r.status === "approved" || r.status === "pending") && r.start_date > today)) {
    return null;
  }

  const horizon = iso(parse(today) + 90 * DAY);
  for (const holiday of holidays) {
    const d = holiday.holiday_date;
    if (d <= today || d > horizon) continue;
    const t = parse(d);
    const dow = new Date(t).getUTCDay();
    // [first leave day, last leave day, total days off] per weekday.
    const plan: Record<number, [number, number, number]> = {
      1: [-3, -3, 4], // Mon holiday: take the Friday before
      2: [-1, -1, 4], // Tue: take Monday
      3: [1, 2, 5], //   Wed: take Thu + Fri
      4: [1, 1, 4], //   Thu: take Friday
      5: [3, 3, 4], //   Fri: take the Monday after
    };
    const p = plan[dow];
    if (!p) continue;
    const start = iso(t + p[0] * DAY);
    const end = iso(t + p[1] * DAY);
    if (start <= today) continue;
    const cost = (parse(end) - parse(start)) / DAY + 1;
    return { monthsSince, holiday, start, end, cost, breakDays: p[2] };
  }
  return null;
}

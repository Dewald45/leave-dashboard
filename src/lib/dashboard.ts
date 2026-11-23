/**
 * Dashboard helpers: the year-at-a-glance strip and the "take a break" nudge.
 * Plain functions over already-loaded rows, so they're easy to reason about.
 */
import type { PublicHoliday, RequestWithRelations } from "@/lib/types";
import { accrualDates, accrualStep, earnedBy } from "@/lib/leave";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const parse = (s: string) => Date.parse(s + "T00:00:00Z");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DayKind =
  | "out"
  | "free"
  | "weekend"
  | "holiday"
  | "closed"
  | "taken"
  | "booked"
  | "pending";

/** Annual office shutdown: closed from 18 Dec up to and including 6 Jan. */
export const CLOSURE = { from: "12-18", to: "01-06" } as const;
export const isClosureDay = (date: string) => {
  const md = date.slice(5);
  return md >= CLOSURE.from || md <= CLOSURE.to;
};
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
        kind: !inCycle ? "out" : hit ? hit.kind : isClosureDay(date) ? "closed" : hol ? "holiday" : "free",
        note: hit?.note ?? (isClosureDay(date) ? "Company closed" : hol ?? ""),
      });
    }
    weeks.push({ label, days });
    monday += 7 * DAY;
  }
  return weeks;
}

/** One day in the calendar, keyed by ISO date in `CalendarData.days`. */
export type CalendarDay = { kind: DayKind; note: string };

export interface CalendarMonth {
  /** "2026-11" */
  key: string;
  label: string;
  /** Working days in this month that cost the employee leave. */
  leaveDays: number;
}

export interface CalendarData {
  /** Only days that are something other than an ordinary working day. */
  days: Record<string, CalendarDay>;
  /** Every month the leave cycle touches, in order. */
  months: CalendarMonth[];
  /** Month to open on: the current one when it's in the cycle, else the first. */
  initialMonth: string;
}

/**
 * The dashboard calendar: every notable day in the leave cycle, plus the list
 * of months it spans.
 *
 * Only days worth marking are stored — ordinary working days and weekends are
 * left out and the component fills them in. That keeps the payload to the
 * client small (a few dozen entries rather than 365).
 */
export function buildCalendar(
  cycleStart: string,
  cycleEnd: string,
  today: string,
  requests: RequestWithRelations[],
  holidays: PublicHoliday[]
): CalendarData {
  const holidayName = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const days: Record<string, CalendarDay> = {};

  const start = parse(cycleStart);
  const end = parse(cycleEnd);

  // Holidays and the closure first, so a request laid over them wins.
  for (let t = start; t <= end; t += DAY) {
    const date = iso(t);
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekends cost nothing
    if (isClosureDay(date)) {
      days[date] = { kind: "closed", note: "Office closed" };
    } else {
      const hol = holidayName.get(date);
      if (hol) days[date] = { kind: "holiday", note: hol };
    }
  }

  for (const r of requests) {
    if (r.status !== "approved" && r.status !== "pending") continue;
    const kind: DayKind =
      r.status === "pending" ? "pending" : r.end_date < today ? "taken" : "booked";
    const name = r.leave_types?.name ?? "Leave";
    const label =
      kind === "pending" ? `${name} — awaiting approval` : kind === "taken" ? `${name} — taken` : `${name} — booked`;
    for (let t = parse(r.start_date); t <= parse(r.end_date); t += DAY) {
      const date = iso(t);
      if (t < start || t > end) continue;
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      days[date] = { kind, note: label };
    }
  }

  // Months the cycle spans, with a per-month count of days that cost leave.
  const months: CalendarMonth[] = [];
  const firstOfMonth = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };
  for (let m = firstOfMonth(start); m <= end; ) {
    const d = new Date(m);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    let leaveDays = 0;
    for (const [date, info] of Object.entries(days)) {
      if (!date.startsWith(key)) continue;
      if (info.kind === "taken" || info.kind === "booked" || info.kind === "pending") leaveDays++;
    }
    months.push({
      key,
      label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      leaveDays,
    });
    m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }

  const todayKey = today.slice(0, 7);
  const initialMonth = months.some((m) => m.key === todayKey)
    ? todayKey
    : months[0]?.key ?? todayKey;

  return { days, months, initialMonth };
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

/**
 * Where someone stands on annual leave they've actually earned so far.
 * Leave lands monthly (see accrualDates); the closure days come off on the
 * day the office closes. When the result is negative, `backToZero` is the
 * payday that brings it back up (null if not within this leave year).
 */
export type EarnedPosition = {
  balance: number;
  step: number;
  nextDate: string | null;
  backToZero: string | null;
  closureDate: string | null;
};

export function earnedPosition(opts: {
  today: string;
  cycleStart: string;
  cycleEnd: string;
  entitled: number;
  available: number;
  pending: number;
  reserved: number;
}): EarnedPosition {
  const { today, cycleStart, cycleEnd, entitled, available, pending, reserved } = opts;
  const dates = accrualDates(cycleStart, cycleEnd);
  const step = accrualStep(cycleStart, cycleEnd, entitled);
  const earned = earnedBy(today, cycleStart, cycleEnd, entitled);
  // The 18 Dec that falls inside this leave year.
  const y0 = Number(cycleStart.slice(0, 4));
  const closureDate =
    [`${y0}-${CLOSURE.from}`, `${y0 + 1}-${CLOSURE.from}`].find((d) => d >= cycleStart && d <= cycleEnd) ?? null;
  const closurePassed = closureDate !== null && today >= closureDate;
  // available = entitled − reserved − used + carry + adjustments
  const spent = entitled - available; // reserved + used − carry − adj
  const round = (n: number) => Math.round(n * 100) / 100;
  const balance = round(earned - spent - pending + (closurePassed ? 0 : reserved));

  const nextDate = dates.find((d) => d > today) ?? null;
  let backToZero: string | null = null;
  if (balance < 0) {
    let b = balance;
    let closed = closurePassed;
    for (const d of dates.filter((d) => d > today)) {
      if (!closed && closureDate && closureDate <= d) {
        b -= reserved;
        closed = true;
      }
      b += step;
      if (b >= -1e-9) {
        backToZero = d;
        break;
      }
    }
  }
  return { balance, step: round(step), nextDate, backToZero, closureDate };
}

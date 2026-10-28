/**
 * Leave business helpers — South African context.
 * Working days exclude weekends and public holidays (BCEA uses working days
 * for the common 5-day-week annual-leave calculation).
 */

// Public holidays live in the `public_holidays` table (edited in Admin) and are
// passed in, so this module stays usable from client components.

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in South Africa, whatever the server's timezone. */
export function todaySA(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

/**
 * Whether the requester can still cancel: pending requests any time, approved
 * leave only until it starts (once it has begun it's been taken).
 */
export function canCancel(r: { status: string; start_date: string }): boolean {
  if (r.status === "pending") return true;
  return r.status === "approved" && r.start_date > todaySA();
}

/** Count working days (Mon–Fri, excluding the given public holidays) inclusive. */
export function workingDaysBetween(
  startISO: string,
  endISO: string,
  holidays: ReadonlySet<string>
): number {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  if (end < start) return 0;

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0 Sun … 6 Sat
    const iso = toISO(cur);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function isWeekendOrHoliday(iso: string, holidays: ReadonlySet<string>): boolean {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6 || holidays.has(iso);
}

export type HalfDay = "am" | "pm";

export const HALF_DAY_LABELS: Record<HalfDay, string> = {
  am: "Morning",
  pm: "Afternoon",
};

/** "3", "½ (morning)", "2.5" — how many days a request takes, for tables. */
export function formatDays(days: number, halfDay?: HalfDay | null): string {
  if (halfDay) return `½ (${HALF_DAY_LABELS[halfDay].toLowerCase()})`;
  return Number.isInteger(days) ? String(days) : String(Number(days.toFixed(2)));
}

/** "Morning (½ day)" or "3 working days" — for headings and sentences. */
export function describeDuration(days: number, halfDay?: HalfDay | null): string {
  if (halfDay) return `${HALF_DAY_LABELS[halfDay]} (½ day)`;
  const n = formatDays(days);
  return `${n} working day${n === "1" ? "" : "s"}`;
}

/**
 * Card accents. The DB still carries the original per-type colours (blue,
 * amber, purple); these override them so the dashboard reads in the brand's
 * three-colour language. Chosen for legibility on the black cards:
 *   green  = leave you've earned and can spend
 *   red    = leave you only touch when something's wrong
 *   orange = statutory leave with strings attached
 */
export const LEAVE_ACCENTS: Record<string, string> = {
  annual: "#22c55e",
  closure: "#22c55e",
  sick: "#ef4444",
  family: "#ff9500",
  parental: "#ff9500",
};

export function leaveAccent(code: string, fallback: string): string {
  return LEAVE_ACCENTS[code] ?? fallback;
}

export const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 ring-amber-600/20",
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-sand-100 text-sand-600 ring-sand-600/20",
  },
};

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A date range without repeating itself: "23 – 25 Nov 2026", "28 Nov – 2 Dec 2026". */
export function formatDateRange(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatDate(startISO);
  const s = new Date(startISO + "T00:00:00Z");
  const e = new Date(endISO + "T00:00:00Z");
  const part = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-ZA", { ...opts, timeZone: "UTC" });
  if (s.getUTCFullYear() !== e.getUTCFullYear()) {
    return `${formatDate(startISO)} – ${formatDate(endISO)}`;
  }
  const startText =
    s.getUTCMonth() === e.getUTCMonth()
      ? part(s, { day: "numeric" })
      : part(s, { day: "numeric", month: "short" });
  return `${startText} – ${formatDate(endISO)}`;
}

/** "15 Oct 2026, 14:05" in South African time, from an ISO timestamp. */
export function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  });
}

/**
 * Leave earned by the end of `dateISO` within a cycle — straight-line, the same
 * rule as `leave_accrued()` in schema.sql (15 days over 12 months ≈ 1.25 a month).
 */
export function earnedBy(
  dateISO: string,
  cycleStart: string,
  cycleEnd: string,
  entitled: number
): number {
  const day = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
  const length = day(cycleEnd) - day(cycleStart) + 1;
  const elapsed = Math.min(day(dateISO), day(cycleEnd)) - day(cycleStart) + 1;
  if (length <= 0) return 0;
  const v = Math.round(((entitled * Math.max(0, elapsed)) / length) * 100) / 100;
  return Math.min(entitled, Math.max(0, v));
}

/** First date in the cycle by which at least `days` have been earned (ISO), or null if never. */
export function dateEarning(
  days: number,
  cycleStart: string,
  cycleEnd: string,
  entitled: number
): string | null {
  if (days > entitled || entitled <= 0) return null;
  const start = Date.parse(cycleStart + "T00:00:00Z");
  const length = (Date.parse(cycleEnd + "T00:00:00Z") - start) / 86_400_000 + 1;
  const n = Math.max(1, Math.ceil((days / entitled) * length - 1e-9));
  return new Date(start + (n - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Leave business helpers — South African context.
 * Working days exclude weekends and public holidays (BCEA uses working days
 * for the common 5-day-week annual-leave calculation).
 */

// South African public holidays incl. observed Mondays (2025–2027).
export const SA_PUBLIC_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-03-21", "2025-04-18", "2025-04-21", "2025-04-28",
  "2025-05-01", "2025-06-16", "2025-08-09", "2025-09-24", "2025-12-16",
  "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-03-21", "2026-04-03", "2026-04-06", "2026-04-27",
  "2026-05-01", "2026-06-16", "2026-08-10", "2026-09-24", "2026-12-16",
  "2026-12-25", "2026-12-26",
  // 2027
  "2027-01-01", "2027-03-22", "2027-03-26", "2027-03-29", "2027-04-27",
  "2027-05-01", "2027-06-16", "2027-08-09", "2027-09-24", "2027-12-16",
  "2027-12-25", "2027-12-27",
];

const HOLIDAY_SET = new Set(SA_PUBLIC_HOLIDAYS);

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Count working days (Mon–Fri, excluding SA public holidays) inclusive. */
export function workingDaysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  if (end < start) return 0;

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0 Sun … 6 Sat
    const iso = toISO(cur);
    if (dow !== 0 && dow !== 6 && !HOLIDAY_SET.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function isWeekendOrHoliday(iso: string): boolean {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6 || HOLIDAY_SET.has(iso);
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

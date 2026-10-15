import "server-only";
import { q } from "@/lib/db";
import type { PublicHoliday } from "@/lib/types";

export function getHolidays() {
  return q<PublicHoliday>(
    "select holiday_date::text as holiday_date, name from public_holidays order by holiday_date"
  );
}

/** Just the ISO dates — what workingDaysBetween() needs. */
export async function getHolidayDates(): Promise<string[]> {
  const rows = await q<{ d: string }>(
    "select holiday_date::text as d from public_holidays"
  );
  return rows.map((r) => r.d);
}

export async function getHolidaySet(): Promise<Set<string>> {
  return new Set(await getHolidayDates());
}

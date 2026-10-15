import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/reminders";
import { ensureHolidays, runHolidayReminders } from "@/lib/holidayReminders";

export const dynamic = "force-dynamic";

/**
 * Sends approval reminders / escalations and upcoming-public-holiday emails,
 * and fills in new years of public holidays. Called hourly by the in-process
 * timer in src/instrumentation.ts, or by an external scheduler that knows
 * CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const result = await runReminders();
  if (result.reminded || result.escalated) {
    console.log(`[reminders] sent ${result.reminded} reminder(s), ${result.escalated} escalation(s)`);
  }
  // New years of public holidays appear on their own; then announce any coming up.
  await ensureHolidays();
  const holidays = await runHolidayReminders();
  if (holidays.holidays) {
    console.log(`[reminders] announced ${holidays.holidays} public holiday(s) in ${holidays.emails} email(s)`);
  }
  return NextResponse.json({ ...result, holiday_reminders: holidays });
}

import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/**
 * Sends approval reminders / escalations. Called hourly by the in-process
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
  return NextResponse.json(result);
}

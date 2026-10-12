import "server-only";
import { q } from "@/lib/db";
import { ensureAllCurrentBalances } from "@/lib/data";
import { notifyEmployeeOfExpiry } from "@/lib/email";

/**
 * Warnings go out when carried-over leave has this many days (or fewer) left
 * before it expires. Each warning is sent once per balance.
 */
export const EXPIRY_WARNING_DAYS = [90, 30, 7] as const;

type ExpiringRow = {
  balance_id: string;
  full_name: string;
  email: string;
  leave_name: string;
  carry_left: number;
  carry_expires: string;
  days_left: number;
};

/**
 * Email every employee whose carried-over leave is close to expiring.
 * Safe to run as often as you like: leave_expiry_alerts records each warning,
 * so nobody gets the same one twice. Returns how many emails were sent.
 */
export async function sendExpiryAlerts(): Promise<number> {
  await ensureAllCurrentBalances();

  const rows = await q<ExpiringRow>(
    `select b.id as balance_id, p.full_name, p.email, b.leave_name,
            b.carry_left::float8 as carry_left, b.carry_expires::text as carry_expires,
            (b.carry_expires - current_date)::int as days_left
       from balance_summary b
       join profiles p on p.id = b.profile_id
      where b.is_current and b.carry_left > 0`
  );

  let sent = 0;
  for (const r of rows) {
    // The tightest warning that applies today — if the app was down for a
    // while, send the relevant one rather than replaying the ones it missed.
    const threshold = [...EXPIRY_WARNING_DAYS]
      .sort((a, b) => a - b)
      .find((t) => r.days_left <= t);
    if (threshold === undefined) continue;

    // Claim the warning first so two runs can't both send it.
    const claimed = await q(
      `insert into leave_expiry_alerts (balance_id, days_before) values ($1, $2)
       on conflict do nothing returning balance_id`,
      [r.balance_id, threshold]
    );
    if (claimed.length === 0) continue;

    const ok = await notifyEmployeeOfExpiry({
      employeeEmail: r.email,
      employeeName: r.full_name.split(" ")[0],
      leaveType: r.leave_name,
      days: r.carry_left,
      expiresOn: r.carry_expires,
      daysLeft: r.days_left,
    });

    if (ok) {
      sent++;
    } else {
      // Not delivered (no API key, Resend down…) — release it to retry next run.
      await q(
        "delete from leave_expiry_alerts where balance_id = $1 and days_before = $2",
        [r.balance_id, threshold]
      );
    }
  }
  return sent;
}

import "server-only";
import { q1 } from "@/lib/db";

/**
 * Brakes on password guessing and reset-email flooding. Attempts are counted
 * from the audit trail itself (every failed sign-in and reset request is
 * already recorded there), so there's no separate table to keep in step.
 */

const SIGN_IN_WINDOW_MIN = 15;
/** Wrong passwords for one email address before it's paused. */
const SIGN_IN_PER_EMAIL = 5;
/** Wrong passwords from one IP (any addresses) before it's paused. */
const SIGN_IN_PER_IP = 20;

const RESET_WINDOW_MIN = 60;
const RESET_PER_EMAIL = 3;
const RESET_PER_IP = 10;

/**
 * Minutes until this email / IP may try to sign in again, or 0 if it may now.
 * Failures before the account's last successful sign-in don't count.
 */
export async function signInWaitMinutes(email: string, ip: string | null): Promise<number> {
  const row = await q1<{ email_wait: number | null; ip_wait: number | null }>(
    `with last_ok as (
       select max(a.at) as at from audit_log a
        join users u on u.id::text = a.entity_id
        where a.action = 'auth.signed_in' and lower(u.email) = lower($1)
     ),
     by_email as (
       select at from audit_log
        where action = 'auth.sign_in_failed'
          and lower(details->>'email') = lower($1)
          and at > now() - make_interval(mins => $3)
          and at > coalesce((select at from last_ok), '-infinity')
        order by at desc limit $4
     ),
     by_ip as (
       select at from audit_log
        where action = 'auth.sign_in_failed' and $2::text is not null and ip = $2
          and at > now() - make_interval(mins => $3)
        order by at desc limit $5
     )
     select
       case when (select count(*) from by_email) >= $4
            then ceil(extract(epoch from (select min(at) from by_email) + make_interval(mins => $3) - now()) / 60)
       end as email_wait,
       case when (select count(*) from by_ip) >= $5
            then ceil(extract(epoch from (select min(at) from by_ip) + make_interval(mins => $3) - now()) / 60)
       end as ip_wait`,
    [email, ip, SIGN_IN_WINDOW_MIN, SIGN_IN_PER_EMAIL, SIGN_IN_PER_IP]
  );
  return Math.max(0, Number(row?.email_wait ?? 0), Number(row?.ip_wait ?? 0));
}

/** True when another reset email for this address / from this IP is allowed. */
export async function resetAllowed(email: string, ip: string | null): Promise<boolean> {
  const row = await q1<{ by_email: number; by_ip: number }>(
    `select
       (select count(*) from audit_log
         where action in ('password.reset_requested', 'password.reset_unknown_email')
           and lower(details->>'email') = lower($1)
           and at > now() - make_interval(mins => $3))::int as by_email,
       (select count(*) from audit_log
         where action in ('password.reset_requested', 'password.reset_unknown_email')
           and $2::text is not null and ip = $2
           and at > now() - make_interval(mins => $3))::int as by_ip`,
    [email, ip, RESET_WINDOW_MIN]
  );
  return (row?.by_email ?? 0) < RESET_PER_EMAIL && (row?.by_ip ?? 0) < RESET_PER_IP;
}

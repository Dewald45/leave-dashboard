import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { q, q1 } from "@/lib/db";

const RESET_TTL_MINUTES = 60;
/** Don't send more than one reset email per account in this window. */
const RESEND_COOLDOWN_MINUTES = 2;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a single-use reset token, or null if one was issued moments ago. */
export async function createResetToken(userId: string): Promise<string | null> {
  const recent = await q1(
    `select 1 from password_resets
      where user_id = $1 and created_at > now() - make_interval(mins => $2)`,
    [userId, RESEND_COOLDOWN_MINUTES]
  );
  if (recent) return null;

  const token = randomBytes(32).toString("hex");
  await q(
    `insert into password_resets (token_hash, user_id, expires_at)
     values ($1, $2, now() + make_interval(mins => $3))`,
    [hashToken(token), userId, RESET_TTL_MINUTES]
  );
  return token;
}

/** The user a still-valid token belongs to, or null. */
export async function findResetUser(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return q1<{ user_id: string }>(
    `select user_id from password_resets
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [hashToken(token)]
  );
}

/** Burn every outstanding token for this user. */
export async function consumeResetTokens(userId: string) {
  await q(
    "update password_resets set used_at = now() where user_id = $1 and used_at is null",
    [userId]
  );
}

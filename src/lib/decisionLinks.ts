import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { q, q1 } from "@/lib/db";

/** How long an emailed Approve / Decline link stays usable. */
const LINK_TTL_DAYS = 14;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * A fresh link token for this approver and request. The token is the only
 * credential in the link, so it's long and random, and only its hash is kept.
 */
export async function createDecisionLink(requestId: string, approverId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q(
    `insert into decision_links (token_hash, request_id, approver_id, expires_at)
     values ($1, $2, $3, now() + make_interval(days => $4))`,
    [hashToken(token), requestId, approverId, LINK_TTL_DAYS]
  );
  return token;
}

export type DecisionLink = {
  request_id: string;
  approver_id: string;
  expired: boolean;
  used: boolean;
};

export async function findDecisionLink(token: string): Promise<DecisionLink | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return q1<DecisionLink>(
    `select request_id, approver_id, expires_at <= now() as expired, used_at is not null as used
       from decision_links where token_hash = $1`,
    [hashToken(token)]
  );
}

/** Use up the link; false if someone (or another tab) already did. */
export async function claimDecisionLink(token: string): Promise<boolean> {
  const row = await q1(
    `update decision_links set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning 1`,
    [hashToken(token)]
  );
  return !!row;
}

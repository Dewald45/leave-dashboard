import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { q, q1 } from "./db";
import type { Profile } from "./types";

export const SESSION_COOKIE = "lv_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Create a session row + set the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await q(
    "insert into sessions (token, user_id, expires_at) values ($1, $2, $3)",
    [token, userId, expires]
  );
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Delete the current session (DB + cookie). */
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await q("delete from sessions where token = $1", [token]);
    } catch {
      /* ignore */
    }
  }
  cookies().delete(SESSION_COOKIE);
}

/** Resolve the signed-in user's profile from the session cookie, or null. */
export async function getSessionProfile(): Promise<Profile | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return q1<Profile>(
    `select p.id, p.full_name, p.email, p.role, p.manager_id, p.department,
            p.job_title, p.gender, p.employment_start_date::text as employment_start_date,
            p.created_at
       from sessions s
       join profiles p on p.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [token]
  );
}

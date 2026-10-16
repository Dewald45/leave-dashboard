"use server";

import { redirect } from "next/navigation";
import { q1 } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { signInWaitMinutes } from "@/lib/rateLimit";

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Too many wrong passwords for this address (or from this connection):
  // don't even check this one. Same answer whether or not the account exists.
  const wait = await signInWaitMinutes(email, clientIp());
  if (wait > 0) {
    await audit({
      action: "auth.sign_in_blocked",
      entityType: "account",
      summary: `Sign-in blocked for ${email} after too many wrong passwords`,
      details: { email, wait_minutes: wait },
    });
    return {
      error: `Too many wrong passwords. Try again in ${wait} minute${
        wait === 1 ? "" : "s"
      }, or reset your password.`,
    };
  }

  const user = await q1<{ id: string; password_hash: string }>(
    "select id, password_hash from users where lower(email) = lower($1)",
    [email]
  );

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const who = user
      ? await q1<{ id: string; full_name: string }>(
          "select id, full_name from profiles where id = $1",
          [user.id]
        )
      : null;
    await audit({
      action: "auth.sign_in_failed",
      entityType: "account",
      entityId: user?.id ?? null,
      subject: who,
      summary: `Failed sign-in for ${email}${user ? " (wrong password)" : " (no such account)"}`,
      details: { email },
    });
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  const me = await q1<{ id: string; full_name: string; email: string }>(
    "select id, full_name, email from profiles where id = $1",
    [user.id]
  );
  await audit({
    actor: me,
    action: "auth.signed_in",
    entityType: "account",
    entityId: user.id,
    subject: me,
    summary: "Signed in",
  });
  redirect("/dashboard");
}

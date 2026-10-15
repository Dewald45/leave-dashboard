"use server";

import { redirect } from "next/navigation";
import { q1 } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
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

"use server";

import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { consumeResetTokens, findResetUser } from "@/lib/passwordReset";
import { audit } from "@/lib/audit";
import { q1 } from "@/lib/db";

export async function resetWithToken(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "Those passwords don't match." };

  const found = await findResetUser(token);
  if (!found) return { error: "This link has expired or was already used. Request a new one." };

  await q("update users set password_hash = $1 where id = $2", [
    await hashPassword(password),
    found.user_id,
  ]);
  await consumeResetTokens(found.user_id);
  // Sign out everywhere else, then sign in here.
  await q("delete from sessions where user_id = $1", [found.user_id]);
  await createSession(found.user_id);
  const who = await q1<{ id: string; full_name: string; email: string }>(
    "select id, full_name, email from profiles where id = $1",
    [found.user_id]
  );
  await audit({
    actor: who,
    action: "password.reset_completed",
    entityType: "account",
    entityId: found.user_id,
    subject: who,
    summary: "Reset password via emailed link (other devices signed out)",
  });
  redirect("/dashboard");
}

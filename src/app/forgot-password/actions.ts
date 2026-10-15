"use server";

import { q1 } from "@/lib/db";
import { createResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";
import { audit } from "@/lib/audit";

export async function requestReset(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return { error: "Enter your work email.", sent: false };

  const user = await q1<{ id: string; full_name: string; email: string }>(
    `select u.id, p.full_name, p.email from users u join profiles p on p.id = u.id
      where lower(u.email) = lower($1)`,
    [email]
  );
  if (user) {
    const token = await createResetToken(user.id);
    if (token) {
      await sendPasswordResetEmail({ to: user.email, name: user.full_name, token });
      await audit({
        action: "password.reset_requested",
        entityType: "account",
        entityId: user.id,
        subject: user,
        summary: `Password reset link emailed to ${user.email}`,
      });
    }
  }
  // Same answer either way, so this can't be used to find out who works here.
  return { error: "", sent: true };
}

"use server";

import { q1 } from "@/lib/db";
import { createResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";
import { audit, clientIp } from "@/lib/audit";
import { resetAllowed } from "@/lib/rateLimit";

export async function requestReset(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return { error: "Enter your work email.", sent: false };

  // A few reset emails per address per hour is plenty; beyond that, quietly
  // send nothing (the reply below is the same either way).
  if (!(await resetAllowed(email, clientIp()))) {
    return { error: "", sent: true };
  }

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
        details: { email },
      });
    }
  } else {
    // Recorded so the per-connection limit counts guesses at addresses too.
    await audit({
      action: "password.reset_unknown_email",
      entityType: "account",
      summary: `Password reset asked for ${email}, which has no account`,
      details: { email },
    });
  }
  // Same answer either way, so this can't be used to find out who works here.
  return { error: "", sent: true };
}

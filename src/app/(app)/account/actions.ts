"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { q, q1 } from "@/lib/db";
import { getSessionProfile, SESSION_COOKIE } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { disconnect as disconnectGoogle, getGoogleLink } from "@/lib/googleCalendar";
import { syncGmailAutoReply } from "@/lib/gmailAutoReply";

export type AccountResult = { error?: string; success?: string };

export async function changePassword(
  _prev: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const me = await getSessionProfile();
  if (!me) return { error: "Not signed in." };

  const current = String(formData.get("current") || "");
  const next = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (next.length < 8) return { error: "Use at least 8 characters for the new password." };
  if (next !== confirm) return { error: "The new passwords don't match." };

  const user = await q1<{ password_hash: string }>(
    "select password_hash from users where id = $1",
    [me.id]
  );
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    await audit({
      actor: me,
      action: "password.change_failed",
      entityType: "account",
      entityId: me.id,
      subject: me,
      summary: "Tried to change password with the wrong current password",
    });
    return { error: "Your current password is wrong." };
  }

  await q("update users set password_hash = $1 where id = $2", [await hashPassword(next), me.id]);
  // Sign out every other device; keep this one.
  await q("delete from sessions where user_id = $1 and token <> $2", [
    me.id,
    cookies().get(SESSION_COOKIE)?.value ?? "",
  ]);
  await audit({
    actor: me,
    action: "password.changed",
    entityType: "account",
    entityId: me.id,
    subject: me,
    summary: "Changed own password (other devices signed out)",
  });
  return { success: "Password changed. Other devices have been signed out." };
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const link = await getGoogleLink(me.id);
  if (!link) return;
  await disconnectGoogle(me.id);
  await audit({
    actor: me,
    action: "calendar.google_disconnected",
    entityType: "account",
    entityId: me.id,
    subject: me,
    summary: `Disconnected Google Calendar (${link.google_email})`,
  });
  revalidatePath("/account");
}

export async function setHolidayEmails(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const on = formData.get("holiday_emails") === "on";
  const before = await q1<{ holiday_emails: boolean }>(
    "select holiday_emails from profiles where id = $1",
    [me.id]
  );
  if (!before || before.holiday_emails === on) return;
  await q("update profiles set holiday_emails = $1 where id = $2", [on, me.id]);
  await audit({
    actor: me,
    action: "profile.updated",
    entityType: "profile",
    entityId: me.id,
    subject: me,
    summary: `Turned public-holiday reminder emails ${on ? "on" : "off"}`,
    details: { changes: { holiday_emails: { from: before.holiday_emails, to: on } } },
  });
  revalidatePath("/account");
}

export async function setBackupApprover(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me || me.role === "employee") return;
  const backupId = String(formData.get("backup_approver_id") || "") || null;
  if (backupId === me.id) return;
  if (backupId) {
    const ok = await q1(
      "select 1 from profiles where id = $1 and role in ('manager','admin')",
      [backupId]
    );
    if (!ok) return;
  }
  const names = await q1<{ before: string | null; after: string | null }>(
    `select (select b.full_name from profiles p join profiles b on b.id = p.backup_approver_id where p.id = $1) as before,
            (select full_name from profiles where id = $2) as after`,
    [me.id, backupId]
  );
  await q("update profiles set backup_approver_id = $1 where id = $2", [backupId, me.id]);
  if ((names?.before ?? null) !== (names?.after ?? null)) {
    await audit({
      actor: me,
      action: "profile.updated",
      entityType: "profile",
      entityId: me.id,
      subject: me,
      summary: `Set backup approver to ${names?.after ?? "nobody (admins cover)"}`,
      details: { changes: { backup_approver: { from: names?.before ?? null, to: names?.after ?? null } } },
    });
  }
  revalidatePath("/account");
  revalidatePath("/admin");
}

/** Turn the Gmail auto-reply on or off, and save its message. */
export async function setGmailAutoReply(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const link = await getGoogleLink(me.id);
  if (!link?.gmail_allowed) return;
  const on = formData.get("gmail_reply_on") === "on";
  const message = String(formData.get("gmail_reply_message") || "").trim().slice(0, 2000) || null;

  await q(
    "update google_calendar_links set gmail_reply_on = $2, gmail_reply_message = $3 where profile_id = $1",
    [me.id, on, message]
  );
  if (on !== link.gmail_reply_on || message !== link.gmail_reply_message) {
    await audit({
      actor: me,
      action: on ? "calendar.gmail_reply_on" : "calendar.gmail_reply_off",
      entityType: "account",
      entityId: me.id,
      subject: me,
      summary: on
        ? link.gmail_reply_on
          ? "Changed the Gmail auto-reply message"
          : "Turned on the Gmail auto-reply for approved leave"
        : "Turned off the Gmail auto-reply",
      details: { message_changed: message !== link.gmail_reply_message },
    });
  }
  await syncGmailAutoReply(me.id, true);
  revalidatePath("/account");
}

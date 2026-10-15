"use server";

import { revalidatePath } from "next/cache";
import { q, q1 } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { audit, diff } from "@/lib/audit";
import type { Profile } from "@/lib/types";

export type AdminResult = { error?: string; success?: string };

async function assertAdmin(): Promise<Profile> {
  const me = await getSessionProfile();
  if (!me) throw new Error("Not signed in.");
  if (me.role !== "admin") throw new Error("Administrator access required.");
  return me;
}

/** Profile fields as stored, with manager/backup names resolved for the audit trail. */
async function profileSnapshot(id: string) {
  return q1<Record<string, string | null>>(
    `select p.full_name, p.email, p.role::text as role, p.department, p.job_title, p.gender,
            p.employment_start_date::text as employment_start_date,
            m.full_name as manager, b.full_name as backup_approver
       from profiles p
       left join profiles m on m.id = p.manager_id
       left join profiles b on b.id = p.backup_approver_id
      where p.id = $1`,
    [id]
  );
}

function normaliseGender(value: FormDataEntryValue | null): "male" | "female" | null {
  const g = String(value || "").trim().toLowerCase();
  return g === "male" || g === "female" ? g : null;
}

function normaliseRole(value: FormDataEntryValue | null): string {
  const r = String(value || "employee").trim();
  return ["employee", "manager", "admin"].includes(r) ? r : "employee";
}

export async function createEmployee(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  let me: Profile;
  try {
    me = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = normaliseRole(formData.get("role"));
  const department = String(formData.get("department") || "").trim() || null;
  const jobTitle = String(formData.get("job_title") || "").trim() || null;
  const managerId = String(formData.get("manager_id") || "") || null;
  const gender = normaliseGender(formData.get("gender"));
  const startDate =
    String(formData.get("employment_start_date") || "") ||
    new Date().toISOString().slice(0, 10);

  if (!fullName || !email || !password) {
    return { error: "Name, email and a temporary password are required." };
  }
  if (password.length < 8) {
    return { error: "Temporary password must be at least 8 characters." };
  }

  const existing = await q1("select id from users where lower(email) = lower($1)", [
    email,
  ]);
  if (existing) return { error: "A user with that email already exists." };

  const hash = await hashPassword(password);
  const user = await q1<{ id: string }>(
    "insert into users (email, password_hash) values ($1, $2) returning id",
    [email, hash]
  );
  if (!user) return { error: "Could not create the account." };

  await q(
    `insert into profiles (id, full_name, email, role, manager_id, department, job_title, gender, employment_start_date)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [user.id, fullName, email, role, managerId, department, jobTitle, gender, startDate]
  );

  // Per-type allowances from the form. Only store the ones that differ from the
  // company default, so a later change to a default still reaches this person.
  const types = await q<{ id: number; name: string; default_days: number | null; applies_to: string }>(
    "select id, name, default_days::float8 as default_days, applies_to from leave_types"
  );
  const allocations: Record<string, { days: number; default: number }> = {};
  for (const t of types) {
    if (t.applies_to !== "all" && t.applies_to !== gender) continue;
    const raw = formData.get(`days_${t.id}`);
    if (raw === null || raw === "") continue;
    const days = Number(raw);
    if (isNaN(days) || days < 0) continue;
    const def = Number(t.default_days ?? 0);
    if (days !== def) {
      await q(
        `insert into profile_leave_entitlements (profile_id, leave_type_id, days) values ($1, $2, $3)
         on conflict (profile_id, leave_type_id) do update set days = excluded.days`,
        [user.id, t.id, days]
      );
      allocations[t.name] = { days, default: def };
    }
  }

  // Grant the gender-appropriate leave (parental vs maternity) + the rest.
  await q("select public.sync_leave_eligibility($1)", [user.id]);

  await audit({
    actor: me,
    action: "employee.created",
    entityType: "profile",
    entityId: user.id,
    subject: { id: user.id, full_name: fullName },
    summary: `Added ${fullName} (${email}) as ${role}${
      Object.keys(allocations).length ? " with custom leave allowances" : ""
    }`,
    details: { profile: await profileSnapshot(user.id), custom_allowances: allocations },
  });

  revalidatePath("/admin");
  revalidatePath("/team");
  return { success: `${fullName} added. Share the temporary password securely.` };
}

export async function updateEmployee(formData: FormData): Promise<void> {
  const me = await assertAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const before = await profileSnapshot(id);
  if (!before) return;

  const role = normaliseRole(formData.get("role"));
  const managerId = String(formData.get("manager_id") || "") || null;
  const department = String(formData.get("department") || "").trim() || null;
  const gender = normaliseGender(formData.get("gender"));
  let backupId = String(formData.get("backup_approver_id") || "") || null;
  if (backupId === id || role === "employee") backupId = null;

  await q(
    `update profiles set role = $1, manager_id = $2, department = $3, gender = $4,
            backup_approver_id = $5
      where id = $6`,
    [role, managerId, department, gender, backupId, id]
  );
  await q("select public.sync_leave_eligibility($1)", [id]);

  const after = await profileSnapshot(id);
  const changes = after ? diff(before, after) : {};
  if (Object.keys(changes).length) {
    await audit({
      actor: me,
      action: "profile.updated",
      entityType: "profile",
      entityId: id,
      subject: { id, full_name: before.full_name ?? "" },
      summary: `Changed ${before.full_name}'s ${Object.keys(changes).join(", ").replace(/_/g, " ")}`,
      details: { changes },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

export async function updateBalance(formData: FormData): Promise<void> {
  const me = await assertAdmin();
  const id = String(formData.get("balance_id") || "");
  if (!id) return;

  const entitled = Number(formData.get("entitled_days"));
  const reserved = Number(formData.get("reserved_days"));
  // Only sent for leave types that carry over; null leaves the stored value alone.
  const carriedRaw = formData.get("carried_days");
  const carried = carriedRaw === null ? null : Number(carriedRaw);

  const before = await q1<{
    profile_id: string; leave_type_id: number; full_name: string; leave_name: string; year: number;
    entitled_days: number; reserved_days: number; carried_days: number;
  }>(
    `select b.profile_id, b.leave_type_id, p.full_name, lt.name as leave_name, b.year,
            b.entitled_days::float8 as entitled_days, b.reserved_days::float8 as reserved_days,
            b.carried_days::float8 as carried_days
       from leave_balances b join profiles p on p.id = b.profile_id
       join leave_types lt on lt.id = b.leave_type_id
      where b.id = $1`,
    [id]
  );
  if (!before) return;
  const next: { entitled_days: number; reserved_days: number; carried_days?: number } = {
    entitled_days: isNaN(entitled) ? 0 : entitled,
    reserved_days: isNaN(reserved) ? 0 : reserved,
  };
  if (carried !== null && !isNaN(carried)) next.carried_days = Math.max(0, carried);

  await q(
    `update leave_balances
        set entitled_days = $1, reserved_days = $2,
            carried_days = coalesce($3, carried_days),
            carry_settled = carry_settled or $3 is not null
      where id = $4`,
    [next.entitled_days, next.reserved_days, next.carried_days ?? null, id]
  );

  // "Also for future leave years": remember it as this person's allowance.
  const applyFuture = formData.get("apply_future") === "on";
  if (applyFuture) {
    await q(
      `insert into profile_leave_entitlements (profile_id, leave_type_id, days) values ($1, $2, $3)
       on conflict (profile_id, leave_type_id) do update set days = excluded.days`,
      [before.profile_id, before.leave_type_id, next.entitled_days]
    );
  }

  const changes = diff(before, next);
  if (Object.keys(changes).length || applyFuture) {
    await audit({
      actor: me,
      action: "balance.updated",
      entityType: "balance",
      entityId: id,
      subject: { id: before.profile_id, full_name: before.full_name },
      summary: `Changed ${before.full_name}'s ${before.year} ${before.leave_name} allocation${
        applyFuture ? ` (${next.entitled_days} days a year from now on)` : ""
      }`,
      details: { leave_type: before.leave_name, year: before.year, changes, future_years: applyFuture },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function deleteEmployee(formData: FormData): Promise<AdminResult> {
  let me: Profile;
  try {
    me = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "No employee specified." };
  if (id === me.id) return { error: "You can't delete your own account." };

  // Snapshot everything that's about to be cascaded away, so the trail keeps it.
  const profile = await profileSnapshot(id);
  if (!profile) return { error: "That employee no longer exists." };
  const requests = await q(
    `select r.id, lt.name as leave_type, r.start_date::text as start_date,
            r.end_date::text as end_date, r.days::float8 as days, r.half_day,
            r.status::text as status, r.reason, r.decision_note
       from leave_requests r join leave_types lt on lt.id = r.leave_type_id
      where r.profile_id = $1 order by r.start_date`,
    [id]
  );

  await audit({
    actor: me,
    action: "employee.deleted",
    entityType: "profile",
    entityId: id,
    subject: { id, full_name: profile.full_name ?? "" },
    summary: `Removed ${profile.full_name} (${profile.email}) and ${requests.length} leave request(s)`,
    details: { profile, requests },
  });

  // Deleting the user cascades to profile, sessions, balances and requests.
  await q("delete from users where id = $1", [id]);

  revalidatePath("/admin");
  revalidatePath("/team");
  return { success: "Employee removed." };
}

export async function resetPassword(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  let me: Profile;
  try {
    me = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const id = String(formData.get("id") || "");
  const password = String(formData.get("password") || "");
  if (!id) return { error: "No employee specified." };
  if (password.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  const hash = await hashPassword(password);
  const updated = await q(
    "update users set password_hash = $1 where id = $2 returning id",
    [hash, id]
  );
  if (updated.length === 0) return { error: "That employee no longer exists." };

  // Force re-login everywhere with the new password.
  await q("delete from sessions where user_id = $1", [id]);

  const who = await profileSnapshot(id);
  await audit({
    actor: me,
    action: "password.reset_by_admin",
    entityType: "account",
    entityId: id,
    subject: { id, full_name: who?.full_name ?? "" },
    summary: `Set a new password for ${who?.full_name ?? "an employee"} (signed out everywhere)`,
  });

  return { success: "Password updated — share it securely with the employee." };
}

// ---------- public holidays ----------

export async function addHoliday(
  _prev: AdminResult,
  formData: FormData
): Promise<AdminResult> {
  let me: Profile;
  try {
    me = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const date = String(formData.get("holiday_date") || "");
  const name = String(formData.get("name") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  if (!name) return { error: "Give the holiday a name." };

  const existing = await q1<{ name: string }>(
    "select name from public_holidays where holiday_date = $1",
    [date]
  );
  await q(
    `insert into public_holidays (holiday_date, name) values ($1, $2)
     on conflict (holiday_date) do update set name = excluded.name`,
    [date, name.slice(0, 120)]
  );
  await audit({
    actor: me,
    action: existing ? "holiday.renamed" : "holiday.added",
    entityType: "holiday",
    entityId: date,
    summary: existing
      ? `Renamed the ${date} public holiday from “${existing.name}” to “${name}”`
      : `Added public holiday ${date}: ${name}`,
    details: existing ? { changes: { name: { from: existing.name, to: name } } } : { name },
  });
  revalidatePath("/admin");
  revalidatePath("/apply");
  return { success: `${name} added.` };
}

export async function deleteHoliday(formData: FormData): Promise<void> {
  const me = await assertAdmin();
  const date = String(formData.get("holiday_date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const removed = await q1<{ name: string }>(
    "delete from public_holidays where holiday_date = $1 returning name",
    [date]
  );
  if (removed) {
    await audit({
      actor: me,
      action: "holiday.removed",
      entityType: "holiday",
      entityId: date,
      summary: `Removed public holiday ${date}: ${removed.name}`,
      details: { name: removed.name },
    });
  }
  revalidatePath("/admin");
  revalidatePath("/apply");
}

// ---------- company leave defaults ----------

export async function updateLeaveDefault(formData: FormData): Promise<void> {
  const me = await assertAdmin();
  const id = Number(formData.get("leave_type_id"));
  if (!id) return;
  const days = Number(formData.get("default_days"));
  const reserved = Number(formData.get("default_reserved"));
  if (isNaN(days) || days < 0) return;

  const before = await q1<{ name: string; default_days: number; default_reserved: number }>(
    `select name, coalesce(default_days, 0)::float8 as default_days,
            default_reserved::float8 as default_reserved
       from leave_types where id = $1`,
    [id]
  );
  if (!before) return;
  const next = {
    default_days: days,
    default_reserved: isNaN(reserved) || reserved < 0 ? before.default_reserved : Math.min(reserved, days),
  };
  const changes = diff(before, next);
  if (!Object.keys(changes).length) return;

  await q("update leave_types set default_days = $1, default_reserved = $2 where id = $3", [
    next.default_days,
    next.default_reserved,
    id,
  ]);
  await audit({
    actor: me,
    action: "leave_type.updated",
    entityType: "balance",
    entityId: String(id),
    summary: `Changed the company default for ${before.name} to ${next.default_days} days`,
    details: { leave_type: before.name, changes },
  });
  revalidatePath("/admin");
}

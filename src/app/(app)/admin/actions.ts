"use server";

import { revalidatePath } from "next/cache";
import { q, q1 } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { hashPassword } from "@/lib/password";

export type AdminResult = { error?: string; success?: string };

async function assertAdmin(): Promise<string> {
  const me = await getSessionProfile();
  if (!me) throw new Error("Not signed in.");
  if (me.role !== "admin") throw new Error("Administrator access required.");
  return me.id;
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
  try {
    await assertAdmin();
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

  // Grant the gender-appropriate leave (parental vs maternity) + the rest.
  await q("select public.sync_leave_eligibility($1)", [user.id]);

  revalidatePath("/admin");
  revalidatePath("/team");
  return { success: `${fullName} added. Share the temporary password securely.` };
}

export async function updateEmployee(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const role = normaliseRole(formData.get("role"));
  const managerId = String(formData.get("manager_id") || "") || null;
  const department = String(formData.get("department") || "").trim() || null;
  const gender = normaliseGender(formData.get("gender"));

  await q(
    "update profiles set role = $1, manager_id = $2, department = $3, gender = $4 where id = $5",
    [role, managerId, department, gender, id]
  );
  await q("select public.sync_leave_eligibility($1)", [id]);

  revalidatePath("/admin");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

export async function updateBalance(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("balance_id") || "");
  if (!id) return;

  const entitled = Number(formData.get("entitled_days"));
  const reserved = Number(formData.get("reserved_days"));
  // Only sent for leave types that carry over; null leaves the stored value alone.
  const carriedRaw = formData.get("carried_days");
  const carried = carriedRaw === null ? null : Number(carriedRaw);

  await q(
    `update leave_balances
        set entitled_days = $1, reserved_days = $2,
            carried_days = coalesce($3, carried_days),
            carry_settled = carry_settled or $3 is not null
      where id = $4`,
    [
      isNaN(entitled) ? 0 : entitled,
      isNaN(reserved) ? 0 : reserved,
      carried === null || isNaN(carried) ? null : Math.max(0, carried),
      id,
    ]
  );

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function deleteEmployee(formData: FormData): Promise<AdminResult> {
  let adminId: string;
  try {
    adminId = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "No employee specified." };
  if (id === adminId) return { error: "You can't delete your own account." };

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
  try {
    await assertAdmin();
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

  return { success: "Password updated — share it securely with the employee." };
}

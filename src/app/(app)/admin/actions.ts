"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export type AdminResult = { error?: string; success?: string };

/** Verify the caller is an admin (server actions are not covered by middleware). */
async function assertAdmin(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    throw new Error("Administrator access required.");
  }
  return user.id;
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
  const role = String(formData.get("role") || "employee");
  const department = String(formData.get("department") || "").trim() || null;
  const jobTitle = String(formData.get("job_title") || "").trim() || null;
  const managerId = String(formData.get("manager_id") || "") || null;
  const startDate =
    String(formData.get("employment_start_date") || "") ||
    new Date().toISOString().slice(0, 10);

  if (!fullName || !email || !password) {
    return { error: "Name, email and a temporary password are required." };
  }
  if (password.length < 8) {
    return { error: "Temporary password must be at least 8 characters." };
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !created?.user) {
    return { error: createErr?.message || "Could not create the account." };
  }

  // handle_new_user() created a base profile + balances; refine the details.
  const { error: updErr } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      role,
      department,
      job_title: jobTitle,
      manager_id: managerId,
      employment_start_date: startDate,
    })
    .eq("id", created.user.id);

  if (updErr) return { error: updErr.message };

  revalidatePath("/admin");
  revalidatePath("/team");
  return { success: `${fullName} added. Share the temporary password securely.` };
}

export async function updateEmployee(formData: FormData): Promise<void> {
  await assertAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const role = String(formData.get("role") || "employee");
  const managerId = String(formData.get("manager_id") || "") || null;
  const department = String(formData.get("department") || "").trim() || null;

  await admin
    .from("profiles")
    .update({ role, manager_id: managerId, department })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/team");
}

export async function updateBalance(formData: FormData): Promise<void> {
  await assertAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("balance_id") || "");
  if (!id) return;

  const entitled = Number(formData.get("entitled_days"));
  const reserved = Number(formData.get("reserved_days"));

  await admin
    .from("leave_balances")
    .update({
      entitled_days: isNaN(entitled) ? 0 : entitled,
      reserved_days: isNaN(reserved) ? 0 : reserved,
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Permanently delete an employee: removes their auth account, which cascades to
 * their profile, balances and leave history. Their reports' manager_id is set
 * to null. Admins cannot delete themselves.
 */
export async function deleteEmployee(formData: FormData): Promise<AdminResult> {
  let adminId: string;
  try {
    adminId = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "No employee specified." };
  if (id === adminId) {
    return { error: "You can't delete your own account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/team");
  return { success: "Employee removed." };
}

/**
 * Admin sets a new password for an employee (e.g. a forgotten-password reset).
 * The employee signs in immediately with the new password — share it securely.
 */
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

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };

  return { success: "Password updated — share it securely with the employee." };
}

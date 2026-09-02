import { redirect } from "next/navigation";
import AddEmployeeForm from "./AddEmployeeForm";
import { updateEmployee, updateBalance } from "./actions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_YEAR } from "@/lib/queries";
import type { BalanceSummary, Profile } from "@/lib/types";

export default async function AdminPage() {
  const { profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = createClient();
  const [{ data: people }, { data: balances }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("balance_summary").select("*").eq("year", CURRENT_YEAR),
  ]);

  const profiles = (people ?? []) as Profile[];
  const managers = profiles.map((p) => ({ id: p.id, full_name: p.full_name }));
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  const balancesByProfile = new Map<string, BalanceSummary[]>();
  ((balances ?? []) as BalanceSummary[]).forEach((b) => {
    const arr = balancesByProfile.get(b.profile_id) ?? [];
    arr.push(b);
    balancesByProfile.set(b.profile_id, arr);
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
        <p className="text-sm text-slate-500">
          Manage staff, roles, reporting lines and leave allocations.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add an employee
        </h2>
        <AddEmployeeForm managers={managers} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Employees ({profiles.length})
        </h2>
        <div className="space-y-3">
          {profiles.map((p) => {
            const bs = (balancesByProfile.get(p.id) ?? []).sort(
              (a, b) => a.leave_type_id - b.leave_type_id
            );
            return (
              <details
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <div>
                    <span className="font-semibold text-slate-800">
                      {p.full_name}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">
                      {p.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">
                      {p.role}
                    </span>
                    <span>
                      Manager:{" "}
                      {p.manager_id ? nameById.get(p.manager_id) ?? "—" : "—"}
                    </span>
                  </div>
                </summary>

                <div className="border-t border-slate-100 px-5 py-4">
                  {/* Edit profile */}
                  <form
                    action={updateEmployee}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Role
                      </label>
                      <select
                        name="role"
                        defaultValue={p.role}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Line manager
                      </label>
                      <select
                        name="manager_id"
                        defaultValue={p.manager_id ?? ""}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="">— None —</option>
                        {managers
                          .filter((m) => m.id !== p.id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Department
                      </label>
                      <input
                        name="department"
                        defaultValue={p.department ?? ""}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
                    >
                      Save
                    </button>
                  </form>

                  {/* Balances */}
                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {CURRENT_YEAR} allocations
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {bs.map((b) => (
                        <form
                          key={b.id}
                          action={updateBalance}
                          className="flex items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
                        >
                          <input
                            type="hidden"
                            name="balance_id"
                            value={b.id}
                          />
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: b.leave_color }}
                              />
                              {b.leave_name}
                            </div>
                            <div className="flex gap-2">
                              <label className="text-[11px] text-slate-400">
                                Entitled
                                <input
                                  name="entitled_days"
                                  type="number"
                                  step="0.5"
                                  defaultValue={b.entitled_days}
                                  className="mt-0.5 w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="text-[11px] text-slate-400">
                                Reserved
                                <input
                                  name="reserved_days"
                                  type="number"
                                  step="0.5"
                                  defaultValue={b.reserved_days}
                                  className="mt-0.5 w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </label>
                            </div>
                          </div>
                          <button
                            type="submit"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            Update
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import AddEmployeeForm from "./AddEmployeeForm";
import DeleteEmployeeButton from "./DeleteEmployeeButton";
import ResetPasswordForm from "./ResetPasswordForm";
import HolidayForm from "./HolidayForm";
import ExportPanel from "./ExportPanel";
import { updateEmployee, updateBalance, deleteHoliday } from "./actions";
import { getHolidays } from "@/lib/holidays";
import { requireProfile } from "@/lib/auth";
import { getAllProfiles, getAllBalances } from "@/lib/data";
import type { BalanceSummary } from "@/lib/types";
import PageHeader from "@/components/PageHeader";

export default async function AdminPage() {
  const { profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const [profiles, balances, holidays] = await Promise.all([
    getAllProfiles(),
    getAllBalances(),
    getHolidays(),
  ]);
  const managers = profiles.map((p) => ({ id: p.id, full_name: p.full_name }));
  const approvers = profiles.filter((p) => p.role !== "employee");
  const currentYear = new Date().getUTCFullYear();
  const holidaysByYear = new Map<number, typeof holidays>();
  holidays.forEach((h) => {
    const y = Number(h.holiday_date.slice(0, 4));
    holidaysByYear.set(y, [...(holidaysByYear.get(y) ?? []), h]);
  });
  const holidayYears = [...holidaysByYear.keys()].sort((a, b) => b - a);
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  const balancesByProfile = new Map<string, BalanceSummary[]>();
  ((balances ?? []) as BalanceSummary[]).forEach((b) => {
    const arr = balancesByProfile.get(b.profile_id) ?? [];
    arr.push(b);
    balancesByProfile.set(b.profile_id, arr);
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Administration"
        action={
          <Link
            href="/admin/audit"
            className="inline-flex min-h-[40px] items-center rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
          >
            Audit trail →
          </Link>
        }
      >
        Staff, roles, reporting lines and allocations. Try not to enjoy the
        power too much.
      </PageHeader>

      <section id="add-employee" className="scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">
          Add an employee
        </h2>
        <AddEmployeeForm managers={managers} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">
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
                className="rounded-3xl bg-white"
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <div>
                    <span className="font-semibold text-ink-900">
                      {p.full_name}
                    </span>
                    <span className="ml-2 text-xs text-sand-500">
                      {p.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-sand-600">
                    <span className="rounded-full bg-sand-100 px-2 py-0.5 capitalize">
                      {p.role}
                    </span>
                    <span>
                      Manager:{" "}
                      {p.manager_id ? nameById.get(p.manager_id) ?? "—" : "—"}
                    </span>
                  </div>
                </summary>

                <div className="border-t border-sand-100 px-5 py-4">
                  {/* Edit profile */}
                  <form
                    action={updateEmployee}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-sand-600">
                        Role
                      </label>
                      <select
                        name="role"
                        defaultValue={p.role}
                        className="rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-sand-600">
                        Line manager
                      </label>
                      <select
                        name="manager_id"
                        defaultValue={p.manager_id ?? ""}
                        className="rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
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
                      <label className="mb-1 block text-xs font-medium text-sand-600">
                        Department
                      </label>
                      <input
                        name="department"
                        defaultValue={p.department ?? ""}
                        className="rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-sand-600">
                        Gender
                      </label>
                      <select
                        name="gender"
                        defaultValue={p.gender ?? ""}
                        className="rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                      >
                        <option value="">— Unset —</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    {p.role !== "employee" ? (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-sand-600">
                          Backup approver
                        </label>
                        <select
                          name="backup_approver_id"
                          defaultValue={p.backup_approver_id ?? ""}
                          className="rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                        >
                          <option value="">— Admins cover —</option>
                          {approvers
                            .filter((a) => a.id !== p.id)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.full_name}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : null}
                    <button
                      type="submit"
                      className="rounded-full bg-ink-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-ink-800"
                    >
                      Save
                    </button>
                  </form>

                  {/* Balances */}
                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">
                      Current cycle allocations
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {bs.map((b) => (
                        <form
                          key={b.id}
                          action={updateBalance}
                          className="flex flex-wrap items-end gap-2 rounded-2xl border border-sand-100 bg-sand-50 p-3"
                        >
                          <input
                            type="hidden"
                            name="balance_id"
                            value={b.id}
                          />
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-sand-600">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: b.leave_color }}
                              />
                              {b.leave_name}
                            </div>
                            <div className="flex gap-2">
                              <label className="text-[11px] text-sand-500">
                                Entitled
                                <input
                                  name="entitled_days"
                                  type="number"
                                  step="0.5"
                                  defaultValue={b.full_entitled_days}
                                  className="mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="text-[11px] text-sand-500">
                                Reserved
                                <input
                                  name="reserved_days"
                                  type="number"
                                  step="0.5"
                                  defaultValue={b.reserved_days}
                                  className="mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                                />
                              </label>
                              {b.carry_months > 0 ? (
                                <label className="text-[11px] text-sand-500">
                                  Carried over
                                  <input
                                    name="carried_days"
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    defaultValue={b.carried_days}
                                    className="mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                                  />
                                </label>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="submit"
                            className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-xs font-medium text-sand-600 hover:bg-sand-100"
                          >
                            Update
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>

                  {/* Reset password */}
                  <div className="mt-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">
                      Reset password
                    </h3>
                    <ResetPasswordForm id={p.id} />
                  </div>

                  {/* Danger zone */}
                  {p.id !== profile.id ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-3">
                      <p className="text-xs text-rose-700/90">
                        Removing an employee permanently deletes their account,
                        balances and leave history.
                      </p>
                      <DeleteEmployeeButton id={p.id} name={p.full_name} />
                    </div>
                  ) : (
                    <p className="mt-5 text-xs text-sand-500">
                      This is your own account — it can&apos;t be deleted here.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section id="exports" className="scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Exports</h2>
        <ExportPanel currentYear={currentYear} />
      </section>

      <section id="holidays" className="scroll-mt-20">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Public holidays</h2>
        <div className="space-y-4 rounded-3xl bg-white p-6">
          <p className="text-sm text-sand-600">
            These don&apos;t count as working days when leave is calculated. Changes apply
            to new requests — existing requests keep the day count they were submitted with.
          </p>
          <HolidayForm />
          {holidayYears.length === 0 ? (
            <p className="text-sm text-sand-500">No holidays loaded.</p>
          ) : null}
          {holidayYears.map((year) => (
            <details
              key={year}
              open={year >= currentYear}
              className="rounded-2xl border border-sand-100"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-900">
                {year}{" "}
                <span className="font-normal text-sand-500">
                  ({holidaysByYear.get(year)!.length})
                </span>
              </summary>
              <ul className="divide-y divide-sand-100 border-t border-sand-100">
                {holidaysByYear.get(year)!.map((h) => (
                  <li key={h.holiday_date} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span>
                      <span className="inline-block w-36 tabular-nums text-sand-600">
                        {new Date(h.holiday_date + "T00:00:00Z").toLocaleDateString("en-ZA", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </span>
                      <span className="text-ink-900">{h.name}</span>
                    </span>
                    <form action={deleteHoliday}>
                      <input type="hidden" name="holiday_date" value={h.holiday_date} />
                      <button
                        type="submit"
                        aria-label={`Remove ${h.name}`}
                        className="min-h-[32px] rounded-full px-3 text-xs font-medium text-sand-500 hover:bg-rose-50 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

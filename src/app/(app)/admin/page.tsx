import { redirect } from "next/navigation";
import AddEmployeeForm from "./AddEmployeeForm";
import ImportEmployees from "./ImportEmployees";
import DeleteEmployeeButton from "./DeleteEmployeeButton";
import ResetPasswordForm from "./ResetPasswordForm";
import HolidayForm from "./HolidayForm";
import ExportPanel from "./ExportPanel";
import { updateEmployee, updateBalance, deleteHoliday, updateLeaveDefault } from "./actions";
import { getHolidays } from "@/lib/holidays";
import { requireProfile } from "@/lib/auth";
import { getAllProfiles, getAllBalances, getLeaveTypes } from "@/lib/data";
import type { BalanceSummary } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import Panel from "@/components/Panel";
import AdminTabs, { type AdminTab } from "@/components/AdminTabs";

const TAB_KEYS: AdminTab[] = ["people", "defaults", "holidays", "exports"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: string; add?: string };
}) {
  const { profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  // People tab: ?add=import swaps the add-one form for the spreadsheet import.
  const importing = searchParams.add === "import";
  const tab: AdminTab = TAB_KEYS.includes(searchParams.tab as AdminTab)
    ? (searchParams.tab as AdminTab)
    : "people";

  const [profiles, balances, holidays, leaveTypes] = await Promise.all([
    getAllProfiles(),
    getAllBalances(),
    getHolidays(),
    getLeaveTypes(),
  ]);
  const leaveDefaults = leaveTypes.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    default_days: Number(t.default_days ?? 0),
    default_reserved: Number(t.default_reserved ?? 0),
    applies_to: t.applies_to,
  }));
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
    <ScreenPage>
      <PageHeader title="Administration">
        Staff, roles, reporting lines and allocations. Try not to enjoy the
        power too much.
      </PageHeader>

      <AdminTabs active={tab} />

      {tab === "people" ? (
        <div className="grid gap-4 fit:min-h-0 fit:flex-1 lg:grid-cols-5 fit:grid-rows-[minmax(0,1fr)]">
          <section aria-labelledby="employees-heading" className="flex flex-col fit:min-h-0 lg:col-span-3">
            <h2 id="employees-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink-900">
              Employees
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-sand-600">
                {profiles.length}
              </span>
            </h2>
            <div className="space-y-3 fit:min-h-0 fit:flex-1 fit:overflow-y-auto fit:pr-1">
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
                      <label htmlFor={`emp-${p.id}-role`} className="mb-1 block text-xs font-medium text-sand-600">
                        Role
                      </label>
                      <select id={`emp-${p.id}-role`}
                        name="role"
                        defaultValue={p.role}
                        className="min-h-11 sm:min-h-0 rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`emp-${p.id}-manager-id`} className="mb-1 block text-xs font-medium text-sand-600">
                        Line manager
                      </label>
                      <select id={`emp-${p.id}-manager-id`}
                        name="manager_id"
                        defaultValue={p.manager_id ?? ""}
                        className="min-h-11 sm:min-h-0 rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
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
                      <label htmlFor={`emp-${p.id}-department`} className="mb-1 block text-xs font-medium text-sand-600">
                        Department
                      </label>
                      <input id={`emp-${p.id}-department`}
                        name="department"
                        defaultValue={p.department ?? ""}
                        className="min-h-11 sm:min-h-0 rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor={`emp-${p.id}-gender`} className="mb-1 block text-xs font-medium text-sand-600">
                        Gender
                      </label>
                      <select id={`emp-${p.id}-gender`}
                        name="gender"
                        defaultValue={p.gender ?? ""}
                        className="min-h-11 sm:min-h-0 rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
                      >
                        <option value="">— Unset —</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    {p.role !== "employee" ? (
                      <div>
                        <label htmlFor={`emp-${p.id}-backup-approver-id`} className="mb-1 block text-xs font-medium text-sand-600">
                          Backup approver
                        </label>
                        <select id={`emp-${p.id}-backup-approver-id`}
                          name="backup_approver_id"
                          defaultValue={p.backup_approver_id ?? ""}
                          className="min-h-11 sm:min-h-0 rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
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
                      className="min-h-11 sm:min-h-0 rounded-full bg-ink-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-ink-800"
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
                                  className="min-h-11 sm:min-h-0 mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="text-[11px] text-sand-500">
                                Reserved
                                <input
                                  name="reserved_days"
                                  type="number"
                                  step="0.5"
                                  defaultValue={b.reserved_days}
                                  className="min-h-11 sm:min-h-0 mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
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
                                    className="min-h-11 sm:min-h-0 mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                                  />
                                </label>
                              ) : null}
                            </div>
                            <label className="mt-2 flex items-center gap-1.5 text-[11px] text-sand-600">
                              <input type="checkbox" name="apply_future" className="h-3.5 w-3.5 accent-ink-900" />
                              Also use this for future leave years
                            </label>
                          </div>
                          <button
                            type="submit"
                            className="min-h-11 sm:min-h-0 rounded-full border border-sand-300 bg-white px-3 py-1.5 text-xs font-medium text-sand-600 hover:bg-sand-100"
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

          <section id="add-employee" aria-labelledby="add-employee-heading" className="flex scroll-mt-20 flex-col fit:min-h-0 lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="add-employee-heading" className="text-base font-semibold text-ink-900">
                {importing ? "Import from a spreadsheet" : "Add an employee"}
              </h2>
              <a
                href={importing ? "/admin" : "/admin?add=import"}
                className="text-sm font-medium text-brand-700 underline underline-offset-2"
              >
                {importing ? "Add one person instead" : "Import a spreadsheet"}
              </a>
            </div>
            <div className="fit:min-h-0 fit:flex-1 fit:overflow-y-auto fit:rounded-3xl">
              {importing ? (
                <ImportEmployees />
              ) : (
                <AddEmployeeForm managers={managers} leaveTypes={leaveDefaults} />
              )}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "defaults" ? (
        <div className="fit:min-h-0 fit:flex-1 fit:overflow-y-auto fit:rounded-3xl">
          <div className="rounded-3xl bg-white p-6">
          <p className="mb-4 text-sm text-sand-600">
            What everyone gets per leave year unless you set something different for them.
            Used for new employees and each new leave year — balances already running
            aren&apos;t changed.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leaveDefaults.map((t) => (
              <form
                key={t.id}
                action={updateLeaveDefault}
                className="flex flex-wrap items-end gap-2 rounded-2xl border border-sand-100 bg-sand-50 p-3"
              >
                <input type="hidden" name="leave_type_id" value={t.id} />
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-sand-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                    {t.name}
                    {t.applies_to !== "all" ? (
                      <span className="text-sand-500">({t.applies_to === "male" ? "men" : "women"})</span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <label className="text-[11px] text-sand-500">
                      Days a year
                      <input
                        name="default_days"
                        type="number"
                        step="0.5"
                        min="0"
                        defaultValue={t.default_days}
                        className="min-h-11 sm:min-h-0 mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                      />
                    </label>
                    {t.default_reserved > 0 ? (
                      <label className="text-[11px] text-sand-500">
                        Held for closure
                        <input
                          name="default_reserved"
                          type="number"
                          step="0.5"
                          min="0"
                          defaultValue={t.default_reserved}
                          className="min-h-11 sm:min-h-0 mt-0.5 w-20 rounded border border-sand-300 px-2 py-1 text-sm"
                        />
                      </label>
                    ) : (
                      <input type="hidden" name="default_reserved" value={t.default_reserved} />
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  className="min-h-11 sm:min-h-0 rounded-full border border-sand-300 bg-white px-3 py-1.5 text-xs font-medium text-sand-600 hover:bg-sand-100"
                >
                  Save
                </button>
              </form>
            ))}
          </div>
        </div>
        </div>
      ) : null}

      {tab === "holidays" ? (
        <div className="grid items-start gap-4 fit:min-h-0 fit:flex-1 lg:grid-cols-5 fit:grid-rows-[minmax(0,1fr)]">
          <div className="space-y-4 rounded-3xl bg-white p-6 lg:col-span-2">
            <h2 className="text-base font-semibold text-ink-900">Public holidays</h2>
            <p className="text-sm text-sand-600">
            South Africa&apos;s public holidays are filled in automatically from the Public
            Holidays Act (including Sunday holidays moving to Monday), always at least two
            years ahead. Add specially declared days, like election days, here. Removing a
            holiday sticks. None of these count as working days; changes apply to new
            requests only.
          </p>
            <HolidayForm />
          </div>
          <Panel title="Holidays by year" count={holidays.length} className="fit:max-h-full lg:col-span-3" bodyClassName="space-y-3 px-5 pb-5">
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
                      {h.source === "manual" ? (
                        <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                          Added by admin
                        </span>
                      ) : null}
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
          </Panel>
        </div>
      ) : null}

      {tab === "exports" ? (
        <div className="fit:min-h-0 fit:overflow-y-auto">
          <ExportPanel currentYear={currentYear} />
        </div>
      ) : null}
    </ScreenPage>
  );
}

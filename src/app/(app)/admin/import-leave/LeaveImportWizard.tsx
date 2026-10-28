"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  previewLeaveImport,
  runLeaveImport,
  type LeavePreview,
  type PreviewEmployee,
} from "./actions";

function Button({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${
        primary
          ? "bg-ink-900 text-white hover:bg-ink-800"
          : "border border-sand-300 text-ink-800 hover:bg-sand-50"
      }`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

function EmployeeRow({
  emp,
  profiles,
}: {
  emp: PreviewEmployee;
  profiles: { id: string; full_name: string; email: string }[];
}) {
  const [match, setMatch] = useState(emp.suggestedProfileId ?? "new");
  const [included, setIncluded] = useState(true);
  const isNew = match === "new";

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name={`inc_${emp.idx}`}
            checked={included}
            onChange={(e) => setIncluded(e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-ink-900"
          />
          <span>
            <span className="font-semibold text-ink-900">
              {emp.name}
              {emp.initials ? <span className="text-sand-600"> · {emp.initials}</span> : null}
            </span>
            <span className="block text-xs text-sand-600">
              {emp.company} · {emp.empNo} · {emp.txnCount} entr
              {emp.txnCount === 1 ? "y" : "ies"} ·{" "}
              <strong className="text-ink-800">{emp.approvedDays}</strong> approved day
              {emp.approvedDays === 1 ? "" : "s"}
              {emp.pendingDays ? `, ${emp.pendingDays} waiting` : ""}
            </span>
            {emp.unknownTypes.length ? (
              <span className="mt-0.5 block text-xs font-medium text-amber-700">
                Unrecognised leave type: {emp.unknownTypes.join(", ")} (those entries are skipped)
              </span>
            ) : null}
          </span>
        </label>
      </div>

      <input type="hidden" name={`key_${emp.idx}`} value={emp.key} />

      <div className={`grid gap-3 sm:grid-cols-3 ${included ? "" : "pointer-events-none opacity-40"}`}>
        <label className="text-xs font-medium text-sand-700">
          Employee
          <select
            name={`match_${emp.idx}`}
            value={match}
            onChange={(e) => setMatch(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm text-ink-900"
          >
            <option value="new">➕ Create new employee</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.email})
              </option>
            ))}
          </select>
        </label>

        <label className={`text-xs font-medium text-sand-700 ${isNew ? "" : "invisible"}`}>
          Email {isNew ? <span className="text-rose-600">*</span> : null}
          <input
            type="email"
            name={`email_${emp.idx}`}
            placeholder="name@mediarocket.co.za"
            className="mt-1 block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-xs font-medium text-sand-700">
          Start date
          <input
            type="date"
            name={`start_${emp.idx}`}
            defaultValue={emp.suggestedStart}
            className="mt-1 block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm"
          />
          <span className="mt-0.5 block text-[11px] font-normal text-sand-500">
            {isNew ? "Needed for accrual." : "Leave blank to keep the current one."}
          </span>
        </label>
      </div>

      {isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-sand-700">
            Full name <span className="text-rose-600">*</span>
            <input
              type="text"
              name={`name_${emp.idx}`}
              defaultValue={emp.name}
              placeholder="e.g. Jonathan Barrow"
              className="mt-1 block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm"
            />
            <span className="mt-0.5 block text-[11px] font-normal text-sand-500">
              The report only gives a surname &amp; initials — set their real name.
            </span>
          </label>
          <label className="text-xs font-medium text-sand-700">
            Gender (only sets parental vs maternity — optional)
            <select
              name={`gender_${emp.idx}`}
              defaultValue=""
              className="mt-1 block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm"
            >
              <option value="">— Prefer not to say —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
        </div>
      ) : null}
    </li>
  );
}

export default function LeaveImportWizard() {
  const [preview, check] = useFormState(previewLeaveImport, {} as LeavePreview);
  const [result, importNow] = useFormState(runLeaveImport, {} as LeavePreview);

  const employees = preview.employees ?? [];
  const profiles = preview.profiles ?? [];

  if (result.done) {
    const d = result.done;
    return (
      <div className="space-y-4 rounded-3xl bg-white p-6">
        <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Imported leave for <strong>{d.people}</strong>{" "}
          {d.people === 1 ? "person" : "people"} — {d.created} new, {d.matched} matched.{" "}
          <strong>{d.leaveAdded}</strong> leave entr{d.leaveAdded === 1 ? "y" : "ies"} added
          {d.leaveSkipped ? `, ${d.leaveSkipped} already present (skipped)` : ""}.
        </p>

        {d.credentials.length ? (
          <div className="rounded-2xl border border-sand-200 p-4">
            <p className="mb-2 text-sm font-semibold text-ink-900">
              New accounts — share these temporary passwords securely:
            </p>
            <ul className="space-y-1 text-sm">
              {d.credentials.map((c) => (
                <li key={c.email} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-800">{c.name} · {c.email}</span>
                  <code className="rounded bg-sand-100 px-2 py-0.5 text-xs">{c.password}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {d.warnings.length ? (
          <ul className="space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {d.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}

        <a
          href="/admin/import-leave"
          className="inline-flex min-h-11 items-center rounded-full border border-sand-300 px-5 text-sm font-semibold text-ink-800 hover:bg-sand-50"
        >
          Import another file
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-3xl bg-white p-6">
      <form action={check} className="space-y-3">
        <div>
          <label htmlFor="leave-files" className="mb-1 block text-sm font-medium text-ink-800">
            Leave report(s) — .xlsx
          </label>
          <input
            id="leave-files"
            name="files"
            type="file"
            accept=".xlsx"
            multiple
            required
            className="block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-sand-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <p className="mt-1 text-xs text-sand-600">
            The "Leave Transactions Report" export. You can select more than one file.
            Nothing is saved until you confirm on the next step.
          </p>
        </div>
        {preview.error ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {preview.error}
          </p>
        ) : null}
        <Button>Check the file</Button>
      </form>

      {employees.length ? (
        <form action={importNow} className="space-y-4 border-t border-sand-100 pt-4">
          <input type="hidden" name="filesB64" value={JSON.stringify(preview.filesB64 ?? [])} />
          <p className="text-sm text-ink-800">
            Found <strong>{employees.length}</strong>{" "}
            {employees.length === 1 ? "person" : "people"}. Match each to an existing
            employee or create a new one, then import. Untick anyone you want to leave out.
          </p>

          <ul className="divide-y divide-sand-100 rounded-2xl border border-sand-100">
            {employees.map((emp) => (
              <EmployeeRow key={emp.key} emp={emp} profiles={profiles} />
            ))}
          </ul>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-800">
            <input type="checkbox" name="include_waiting" className="h-5 w-5 accent-ink-900" />
            <span>Also import &ldquo;Waiting&rdquo; entries as pending requests</span>
          </label>

          {result.error ? (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {result.error}
            </p>
          ) : null}

          <Button primary>Import leave</Button>
        </form>
      ) : null}
    </div>
  );
}

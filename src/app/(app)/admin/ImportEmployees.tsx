"use client";

import { useFormState, useFormStatus } from "react-dom";
import { previewImport, runImport, type ImportPreview } from "./actions";

function Button({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${
        primary ? "bg-ink-900 text-white hover:bg-ink-800" : "border border-sand-300 text-ink-800 hover:bg-sand-50"
      }`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/** Add many people at once from a spreadsheet: check first, then import. */
export default function ImportEmployees() {
  const [preview, check] = useFormState(previewImport, {} as ImportPreview);
  const [result, importNow] = useFormState(runImport, {} as ImportPreview);

  const rows = preview.rows ?? [];
  const ok = rows.filter((r) => r.problems.length === 0);
  const bad = rows.length - ok.length;

  if (result.done) {
    const d = result.done;
    return (
      <div className="space-y-3 rounded-3xl bg-white p-6">
        <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Added {d.added} {d.added === 1 ? "person" : "people"}
          {d.emailed ? `, and emailed ${d.emailed} a link to choose their password` : ""}.
          {d.skipped ? ` ${d.skipped} row${d.skipped === 1 ? " was" : "s were"} skipped.` : ""}
        </p>
        <a href="/admin?add=import" className="inline-flex min-h-11 items-center rounded-full border border-sand-300 px-5 text-sm font-semibold text-ink-800 hover:bg-sand-50">
          Import another file
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-3xl bg-white p-6">
      <form action={check} className="space-y-3">
        <p className="text-sm text-ink-800">
          Fill in the template in Excel or Google Sheets, save it as CSV, and upload it here. You&apos;ll
          see what will happen before anything is added.
        </p>
        <a href="/import-template.csv" download className="inline-block text-sm font-medium text-brand-700 underline underline-offset-2">
          Download the template
        </a>
        <div>
          <label htmlFor="import-file" className="mb-1 block text-sm font-medium text-ink-800">
            Spreadsheet (CSV)
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-xl border border-sand-300 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-sand-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <p className="mt-1 text-xs text-sand-600">
            Columns: Full name, Email, Role, Manager email, Department, Job title, Gender, Start date.
            Only name and email are required. Dates as 2024-03-01 or 01/03/2024.
          </p>
        </div>
        {preview.error ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{preview.error}</p>
        ) : null}
        <Button>Check the file</Button>
      </form>

      {rows.length ? (
        <div className="space-y-3 border-t border-sand-100 pt-4">
          <p className="text-sm text-ink-800">
            <strong>{ok.length}</strong> ready to add
            {bad ? (
              <>
                , <strong className="text-rose-700">{bad}</strong> with problems (they&apos;ll be skipped)
              </>
            ) : null}
            .
          </p>
          <ul className="divide-y divide-sand-100 rounded-2xl border border-sand-100">
            {rows.map((r) => (
              <li key={r.line} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink-900">
                    {r.full_name || "(no name)"}{" "}
                    <span className="font-normal text-sand-600">{r.email}</span>
                  </div>
                  <div className="text-xs text-sand-600">
                    Row {r.line} · {r.role}
                    {r.department ? ` · ${r.department}` : ""}
                    {r.manager_email ? ` · reports to ${r.manager_email}` : ""}
                  </div>
                  {r.problems.length ? (
                    <div className="mt-0.5 text-xs font-medium text-rose-700">{r.problems.join(". ")}</div>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.problems.length ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {r.problems.length ? "Skip" : "Add"}
                </span>
              </li>
            ))}
          </ul>

          {ok.length ? (
            <form action={importNow} className="space-y-3">
              <input type="hidden" name="csv" value={preview.csv ?? ""} />
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink-800">
                <input type="checkbox" name="send_welcome" defaultChecked className="mt-0.5 h-5 w-5 accent-ink-900" />
                <span>Email each person a link to choose their password (works for 7 days)</span>
              </label>
              {result.error ? (
                <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{result.error}</p>
              ) : null}
              <Button primary>
                Add {ok.length} {ok.length === 1 ? "person" : "people"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

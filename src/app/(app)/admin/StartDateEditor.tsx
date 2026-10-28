"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { changeStartDate, type AdminResult } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 sm:min-h-0 rounded-full bg-ink-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save start date"}
    </button>
  );
}

/**
 * Start date is edited on its own: changing it moves every leave cycle, so once
 * the date differs from the current one a reason is required and the change is
 * written to the audit trail.
 */
export default function StartDateEditor({
  id,
  current,
}: {
  id: string;
  current: string;
}) {
  const [state, action] = useFormState(changeStartDate, {} as AdminResult);
  const [value, setValue] = useState(current);
  const changed = value !== current && /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    <form
      action={action}
      className="mt-4 rounded-2xl border border-sand-200 bg-sand-50/60 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor={`sd-${id}`}
            className="mb-1 block text-xs font-medium text-sand-600"
          >
            Start date
          </label>
          <input
            id={`sd-${id}`}
            type="date"
            name="employment_start_date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-11 sm:min-h-0 rounded-xl border border-sand-300 px-3 py-1.5 text-sm"
          />
        </div>

        {changed ? (
          <div className="min-w-[12rem] flex-1">
            <label
              htmlFor={`sd-reason-${id}`}
              className="mb-1 block text-xs font-medium text-sand-600"
            >
              Reason for the change <span className="text-rose-600">*</span>
            </label>
            <input
              id={`sd-reason-${id}`}
              name="reason"
              type="text"
              required
              placeholder="e.g. Corrected from payroll records"
              className="min-h-11 w-full rounded-xl border border-sand-300 px-3 py-1.5 text-sm sm:min-h-0"
            />
          </div>
        ) : null}

        {changed ? <SaveButton /> : null}
      </div>

      <p className="mt-1.5 text-[11px] text-sand-500">
        Changing the start date moves this person&apos;s leave cycles and is
        recorded in the audit trail.
      </p>

      {state?.error ? (
        <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}

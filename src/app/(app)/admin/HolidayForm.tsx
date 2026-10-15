"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addHoliday, type AdminResult } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[40px] rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Adding…" : "Add holiday"}
    </button>
  );
}

export default function HolidayForm() {
  const [state, formAction] = useFormState(addHoliday, {} as AdminResult);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="holiday_date" className="mb-1 block text-xs font-medium text-sand-600">
          Date
        </label>
        <input
          id="holiday_date"
          name="holiday_date"
          type="date"
          required
          className="min-h-[40px] rounded-xl border border-sand-300 px-3 text-sm"
        />
      </div>
      <div className="min-w-[12rem] flex-1">
        <label htmlFor="holiday_name" className="mb-1 block text-xs font-medium text-sand-600">
          Name
        </label>
        <input
          id="holiday_name"
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Election Day"
          className="min-h-[40px] w-full rounded-xl border border-sand-300 px-3 text-sm"
        />
      </div>
      <SubmitButton />
      {state?.error ? (
        <p role="alert" className="w-full text-xs text-rose-600">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p role="status" className="w-full text-xs text-emerald-700">{state.success}</p>
      ) : null}
    </form>
  );
}

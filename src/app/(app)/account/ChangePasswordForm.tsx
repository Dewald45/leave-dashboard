"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { changePassword, type AccountResult } from "./actions";

const inputClass =
  "w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[40px] rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Change password"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePassword, {} as AccountResult);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="current" className="mb-1 block text-sm font-medium text-ink-800">
          Current password
        </label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-ink-800">
            New password
          </label>
          <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
          <p className="mt-1 text-xs text-sand-500">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-ink-800">
            Confirm new password
          </label>
          <input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
        </div>
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

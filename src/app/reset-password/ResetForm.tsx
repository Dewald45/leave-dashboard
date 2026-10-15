"use client";

import { useFormState, useFormStatus } from "react-dom";
import { resetWithToken } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Set new password"}
    </button>
  );
}

const inputClass =
  "w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useFormState(resetWithToken, { error: "" });
  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-800">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
        <p className="mt-1 text-xs text-sand-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-ink-800">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

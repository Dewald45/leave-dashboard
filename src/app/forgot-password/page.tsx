"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { requestReset } from "./actions";
import AuthShell from "@/components/AuthShell";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Email me a reset link"}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(requestReset, { error: "", sent: false });

  return (
    <AuthShell
      tagline="Happens to the best of us."
      footer={
        <Link href="/login" className="font-medium text-sand-400 hover:text-white">
          ← Back to sign in
        </Link>
      }
    >
      <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-sm">
        {state.sent ? (
          <div role="status" className="space-y-2 text-sm text-ink-800">
            <p className="font-semibold text-ink-900">Check your inbox.</p>
            <p>
              If that email belongs to a TimeOff account, a reset link is on its way. It
              works once and expires in an hour.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-800">
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="you@company.co.za"
              />
            </div>
            {state.error ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {state.error}
              </p>
            ) : null}
            <SubmitButton />
          </form>
        )}
      </div>
    </AuthShell>
  );
}

"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";
import { LogoWordmark } from "@/components/Logo";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
    >
      {pending ? "Verifying…" : "Let me in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, { error: "" } as {
    error: string;
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <LogoWordmark className="mx-auto mb-6 h-10 w-auto text-white" />
          <h1 className="text-2xl font-bold text-white">Leave Dashboard</h1>
          <p className="mt-1 text-sm text-sand-400">
            Where good intentions go to get approved.
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-800">
              Email
            </label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="you@company.co.za"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-800">
              Password
            </label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="••••••••"
            />
          </div>

          {state?.error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>

        <p className="mt-4 text-center text-xs text-sand-500">
          Accounts are handed out by HR. We don&apos;t do self-service here.
        </p>
      </div>
    </main>
  );
}

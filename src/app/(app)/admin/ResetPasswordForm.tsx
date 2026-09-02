"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { resetPassword, type AdminResult } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-ink-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Set password"}
    </button>
  );
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  return Array.from(
    { length: 12 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default function ResetPasswordForm({ id }: { id: string }) {
  const [state, formAction] = useFormState(resetPassword, {} as AdminResult);
  const [pw, setPw] = useState("");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="mb-1 block text-xs font-medium text-sand-600">
          New password
        </label>
        <input
          name="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          minLength={8}
          required
          placeholder="At least 8 characters"
          className="w-56 rounded-lg border border-sand-300 px-3 py-1.5 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => setPw(randomPassword())}
        className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-600 hover:bg-sand-50"
      >
        Generate
      </button>
      <Submit />
      {state?.error ? (
        <span className="w-full text-xs text-rose-600">{state.error}</span>
      ) : null}
      {state?.success ? (
        <span className="w-full text-xs text-emerald-600">{state.success}</span>
      ) : null}
    </form>
  );
}

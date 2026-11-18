"use client";

import { useFormState, useFormStatus } from "react-dom";
import Icon from "@/components/Icon";
import { recalculateCycles, type AdminResult } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-sand-300 bg-white px-4 py-1.5 text-xs font-semibold text-ink-900 transition hover:bg-sand-50 disabled:opacity-50 sm:min-h-0"
    >
      <Icon name="clock" className="h-3.5 w-3.5" />
      {pending ? "Rebuilding…" : "Recalculate leave cycles"}
    </button>
  );
}

/**
 * Rebuild one employee's leave cycles from their start date and their history.
 * Safe to run more than once — it derives everything from stored requests
 * rather than adjusting what is already there.
 */
export default function RecalculateButton({ id }: { id: string }) {
  const [state, formAction] = useFormState(recalculateCycles, {} as AdminResult);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Submit />

      <p className="mt-1.5 text-[11px] text-sand-600">
        Works the carry-over out again from their start date and leave history.
        Use it after importing past leave or correcting a start date.
      </p>

      {state.error ? (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-700">
          <Icon name="warning" className="mt-0.5 h-3.5 w-3.5" />
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="mt-1.5 flex items-start gap-1.5 text-xs text-emerald-800">
          <Icon name="check-circle" className="mt-0.5 h-3.5 w-3.5" />
          {state.success}
        </p>
      ) : null}
    </form>
  );
}

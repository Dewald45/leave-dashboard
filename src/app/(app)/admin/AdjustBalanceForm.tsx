"use client";

import { useFormState, useFormStatus } from "react-dom";
import { adjustBalance, type AdminResult } from "./actions";
import Icon from "@/components/Icon";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50 sm:min-h-0"
    >
      <Icon name="edit" className="h-3.5 w-3.5" />
      {pending ? "Saving…" : "Adjust"}
    </button>
  );
}

/**
 * Take days off, or give days back on, one cycle's balance.
 *
 * Deliberately separate from the "Current cycle allocations" editor above it.
 * That one rewrites what the employee was *entitled* to, which is the wrong
 * tool for a correction: it loses the fact that a correction happened and why.
 * This records a signed entry against the balance, so the entitlement stays as
 * it was and the reason, the author and the date stay on the record. Reverse a
 * mistake by adding the opposite amount.
 */
export default function AdjustBalanceForm({
  balanceId,
  leaveName,
  available,
}: {
  balanceId: string;
  leaveName: string;
  available: number;
}) {
  const [state, formAction] = useFormState(adjustBalance, {} as AdminResult);

  return (
    <form action={formAction} className="rounded-2xl border border-sand-200 bg-white p-3">
      <input type="hidden" name="balance_id" value={balanceId} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-sand-500">
          Days
          <input
            name="days"
            type="number"
            step="0.5"
            placeholder="-10"
            required
            aria-describedby={`adj-help-${balanceId}`}
            className="mt-0.5 block min-h-11 w-24 rounded border border-sand-300 px-2 py-1 text-sm tabular-nums sm:min-h-0"
          />
        </label>
        <label className="min-w-[12rem] flex-1 text-[11px] text-sand-500">
          Reason
          <input
            name="reason"
            type="text"
            required
            minLength={3}
            maxLength={300}
            placeholder="Correcting the cycle rollover"
            className="mt-0.5 block min-h-11 w-full rounded border border-sand-300 px-2 py-1 text-sm sm:min-h-0"
          />
        </label>
        <Submit />
      </div>

      <p id={`adj-help-${balanceId}`} className="mt-2 text-[11px] text-sand-600">
        Negative takes days away, positive gives them back. {leaveName} currently
        shows <strong className="tabular-nums text-ink-900">{available}</strong>{" "}
        available. Recorded in the audit trail with your name.
      </p>

      {state.error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-rose-700">
          <Icon name="warning" className="mt-0.5 h-3.5 w-3.5" />
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="mt-2 flex items-start gap-1.5 text-xs text-emerald-800">
          <Icon name="check-circle" className="mt-0.5 h-3.5 w-3.5" />
          {state.success}
        </p>
      ) : null}
    </form>
  );
}

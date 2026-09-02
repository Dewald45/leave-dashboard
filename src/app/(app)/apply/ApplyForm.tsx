"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRequest, type ActionResult } from "@/app/(app)/actions";
import { workingDaysBetween } from "@/lib/leave";
import type { BalanceSummary, LeaveType } from "@/lib/types";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
    >
      {pending ? "Submitting…" : "Submit request"}
    </button>
  );
}

export default function ApplyForm({
  types,
  balances,
}: {
  types: LeaveType[];
  balances: BalanceSummary[];
}) {
  const [state, formAction] = useFormState(createRequest, {} as ActionResult);
  const [typeId, setTypeId] = useState<number>(types[0]?.id ?? 0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const selectedType = types.find((t) => t.id === typeId);
  const balance = balances.find((b) => b.leave_type_id === typeId);

  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return workingDaysBetween(start, end);
  }, [start, end]);

  const overBalance =
    !!balance &&
    selectedType?.deducts_balance === true &&
    days > Number(balance.available_days);

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {/* Leave type */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Leave type
        </label>
        <select
          name="leave_type_id"
          value={typeId}
          onChange={(e) => setTypeId(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selectedType?.description ? (
          <p className="mt-1 text-xs text-slate-400">
            {selectedType.description}
          </p>
        ) : null}
      </div>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Start date
          </label>
          <input
            type="date"
            name="start_date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            End date
          </label>
          <input
            type="date"
            name="end_date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {/* Live summary */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <div>
          <span className="text-slate-400">Working days: </span>
          <span className="font-semibold text-slate-800">{days}</span>
        </div>
        {balance ? (
          <div>
            <span className="text-slate-400">Available: </span>
            <span className="font-semibold text-slate-800">
              {selectedType?.deducts_balance
                ? balance.available_days
                : `${balance.entitled_days} (company paid)`}
            </span>
          </div>
        ) : null}
        {overBalance ? (
          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
            Exceeds available balance
          </span>
        ) : null}
      </div>

      {/* Reason */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Reason / notes{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          name="reason"
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          placeholder="e.g. Family holiday, medical appointment…"
        />
      </div>

      {state?.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <SubmitButton disabled={days <= 0 || overBalance} />
      </div>
    </form>
  );
}

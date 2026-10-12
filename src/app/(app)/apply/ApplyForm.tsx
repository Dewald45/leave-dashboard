"use client";

import { useEffect, useMemo, useState } from "react";
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
      className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Making your case…" : "Send it up the chain"}
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

  // Once a request has gone through, clear the dates so the summary doesn't
  // look like a second request is being drafted.
  useEffect(() => {
    if (state?.success) {
      setStart("");
      setEnd("");
    }
  }, [state]);

  const selectedType = types.find((t) => t.id === typeId);
  const balance = balances.find((b) => b.leave_type_id === typeId);

  const days = useMemo(() => {
    if (!start || !end || end < start) return 0;
    return workingDaysBetween(start, end);
  }, [start, end]);

  const deducts = selectedType?.deducts_balance === true;
  // Leave starting after this cycle ends counts against the next one, which
  // this page doesn't have the numbers for — the server checks it on submit.
  const nextCycle = !!balance && !!start && start > balance.cycle_end;

  // What can still be booked, after requests already waiting on a manager.
  // Carried-over days only pay for leave that starts before they expire.
  let bookable = 0;
  if (balance) {
    bookable = Number(balance.available_days) - Number(balance.pending_days);
    if (balance.carry_expires && start && start > balance.carry_expires) {
      bookable -= Number(balance.carry_left);
    }
  }
  const showMaths = !!balance && deducts && !nextCycle;
  const leftAfter = bookable - days;
  const overBalance = showMaths && days > bookable;
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-3xl bg-white p-6"
    >
      {/* Leave type */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-800">
          Leave type
        </label>
        <select
          name="leave_type_id"
          value={typeId}
          onChange={(e) => setTypeId(Number(e.target.value))}
          className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selectedType?.description ? (
          <p className="mt-1 text-xs text-sand-500">
            {selectedType.description}
          </p>
        ) : null}
      </div>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Start date
          </label>
          <input
            type="date"
            name="start_date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            End date
          </label>
          <input
            type="date"
            name="end_date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            required
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {/* Live summary */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-sand-100 px-4 py-3 text-sm">
        <div>
          <span className="text-sand-500">Working days: </span>
          <span className="font-semibold text-ink-900">{days}</span>
        </div>
        {balance && !deducts ? (
          <div>
            <span className="text-sand-500">Available: </span>
            <span className="font-semibold text-ink-900">
              {balance.entitled_days} (company paid)
            </span>
          </div>
        ) : null}
        {showMaths ? (
          <>
            <div>
              <span className="text-sand-500">You have: </span>
              <span className="font-semibold text-ink-900">{fmt(bookable)}</span>
            </div>
            {days > 0 && !overBalance ? (
              <div>
                <span className="text-sand-500">Left after this: </span>
                <span className="font-semibold text-ink-900">
                  {fmt(leftAfter)}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
        {nextCycle && deducts ? (
          <span className="text-xs text-sand-600">
            This starts in your next leave year, so it comes off that
            year&apos;s days.
          </span>
        ) : null}
        {overBalance ? (
          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
            {fmt(days - bookable)} more than you have left
          </span>
        ) : null}
      </div>

      {/* Reason */}
      <div>
        <label className="mb-1 block text-sm font-medium text-ink-800">
          Reason / notes{" "}
          <span className="font-normal text-sand-500">(optional)</span>
        </label>
        <textarea
          name="reason"
          rows={3}
          className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRequest, type ActionResult } from "@/app/(app)/actions";
import { workingDaysBetween, isWeekendOrHoliday, formatDays } from "@/lib/leave";
import type { BalanceSummary, LeaveType } from "@/lib/types";

// Mirror SICK_NOTE_THRESHOLD_DAYS / MAX_ATTACHMENT_BYTES in src/lib/attachments.ts (server-only).
const SICK_NOTE_THRESHOLD_DAYS = 2;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const inputClass =
  "w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

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
  holidays,
  initialTypeId,
}: {
  types: LeaveType[];
  balances: BalanceSummary[];
  holidays: string[];
  initialTypeId?: number;
}) {
  const [state, formAction] = useFormState(createRequest, {} as ActionResult);
  const [typeId, setTypeId] = useState<number>(
    initialTypeId ?? types[0]?.id ?? 0
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState<"full" | "am" | "pm">("full");
  const [fileError, setFileError] = useState("");

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

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const singleDay = !!start && (!end || end === start);
  const halfDay = singleDay && duration !== "full" ? duration : null;

  const days = useMemo(() => {
    if (halfDay) return isWeekendOrHoliday(start, holidaySet) ? 0 : 0.5;
    if (!start || !end || end < start) return 0;
    return workingDaysBetween(start, end, holidaySet);
  }, [start, end, halfDay, holidaySet]);

  const isSick = selectedType?.code === "sick";
  const noteRequired = isSick && days > SICK_NOTE_THRESHOLD_DAYS;

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
        <label htmlFor="leave_type_id" className="mb-1 block text-sm font-medium text-ink-800">
          Leave type
        </label>
        <select
          id="leave_type_id"
          name="leave_type_id"
          value={typeId}
          onChange={(e) => setTypeId(Number(e.target.value))}
          className={inputClass}
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
          <label htmlFor="start_date" className="mb-1 block text-sm font-medium text-ink-800">
            Start date
          </label>
          <input
            type="date"
            id="start_date"
          name="start_date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || end < e.target.value) setEnd(e.target.value);
            }}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="end_date" className="mb-1 block text-sm font-medium text-ink-800">
            End date
          </label>
          <input
            type="date"
            id="end_date"
          name="end_date"
            value={end}
            min={start || undefined}
            onChange={(e) => {
              setEnd(e.target.value);
              if (e.target.value !== start) setDuration("full");
            }}
            required
            className={inputClass}
          />
        </div>
      </div>

      {/* Half days — only for a single date */}
      {singleDay ? (
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-ink-800">
            How much of the day?
          </legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(
              [
                ["full", "Full day"],
                ["am", "Morning"],
                ["pm", "Afternoon"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium transition ${
                  duration === value
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-sand-300 bg-white text-ink-800 hover:bg-sand-50"
                }`}
              >
                <input
                  type="radio"
                  name="duration"
                  value={value}
                  checked={duration === value}
                  onChange={() => setDuration(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-sand-500">
            Half days take 0.5 off your balance. Morning is 08:00–12:00, afternoon 13:00–17:00.
          </p>
        </fieldset>
      ) : (
        <input type="hidden" name="duration" value="full" />
      )}

      {/* Live summary */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-sand-100 px-4 py-3 text-sm">
        <div>
          <span className="text-sand-500">Working days: </span>
          <span className="font-semibold text-ink-900">
            {formatDays(days, halfDay)}
          </span>
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
        <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-800">
          Reason / notes{" "}
          <span className="font-normal text-sand-500">(optional)</span>
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          className={inputClass}
          placeholder="e.g. Family holiday, medical appointment…"
        />
      </div>

      {/* Sick note */}
      {isSick ? (
        <div>
          <label htmlFor="attachment" className="mb-1 block text-sm font-medium text-ink-800">
            Medical certificate{" "}
            {noteRequired ? (
              <span className="font-normal text-brand-700">(required for more than {SICK_NOTE_THRESHOLD_DAYS} days)</span>
            ) : (
              <span className="font-normal text-sand-500">(optional)</span>
            )}
          </label>
          <input
            id="attachment"
            type="file"
            name="attachment"
            required={noteRequired}
            aria-describedby="attachment-help"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Catch big files here — past ~6 MB the upload fails before our checks run.
              if (f && f.size > MAX_ATTACHMENT_BYTES) {
                e.target.value = "";
                setFileError("That file is over 5 MB — try a smaller scan or a photo.");
              } else {
                setFileError("");
              }
            }}
            className="block w-full text-sm text-sand-600 file:mr-3 file:min-h-[40px] file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800"
          />
          {fileError ? (
            <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{fileError}</p>
          ) : null}
          <p id="attachment-help" className="mt-1 text-xs text-sand-500">
            PDF or a photo, up to 5 MB. Don&apos;t have it yet? Submit a shorter
            request, or add it later from the request&apos;s thread.
          </p>
        </div>
      ) : null}

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-sand-500">
          We&apos;ll email you an out-of-office event for your calendar straight away.
        </p>
        <SubmitButton disabled={days <= 0 || overBalance} />
      </div>
    </form>
  );
}

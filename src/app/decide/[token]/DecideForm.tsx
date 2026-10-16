"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { decideViaLink, type DecideResult } from "./actions";

function Submit({ decision }: { decision: "approved" | "rejected" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-11 w-full rounded-full px-5 text-sm font-semibold disabled:opacity-60 ${
        decision === "approved" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-rose-700 text-white hover:bg-rose-800"
      }`}
    >
      {pending ? "Saving…" : decision === "approved" ? "Confirm approval" : "Confirm decline"}
    </button>
  );
}

export default function DecideForm({ token, initial }: { token: string; initial: "approved" | "rejected" }) {
  const [state, action] = useFormState(decideViaLink, {} as DecideResult);
  const [decision, setDecision] = useState(initial);

  if (state.done) {
    return (
      <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {state.done === "approved" ? "Approved." : "Declined."} The employee has been told. You can close this page.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={decision} />
      <div role="radiogroup" aria-label="Decision" className="grid grid-cols-2 gap-2">
        {(["approved", "rejected"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={decision === d}
            onClick={() => setDecision(d)}
            className={`min-h-11 rounded-full border text-sm font-medium ${
              decision === d ? "border-ink-900 bg-ink-900 text-white" : "border-sand-300 text-ink-800 hover:bg-sand-100"
            }`}
          >
            {d === "approved" ? "Approve" : "Decline"}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium text-ink-800">
          Note to the employee <span className="font-normal text-sand-500">(optional)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={1000}
          className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </div>
      {state.error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p> : null}
      <Submit decision={decision} />
    </form>
  );
}

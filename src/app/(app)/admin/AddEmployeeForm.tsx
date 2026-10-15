"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createEmployee, type AdminResult } from "./actions";
import type { Profile } from "@/lib/types";

export type LeaveDefault = {
  id: number;
  name: string;
  color: string;
  default_days: number;
  applies_to: "all" | "male" | "female";
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Creating…" : "Add employee"}
    </button>
  );
}

function randomPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  return Array.from(
    { length: 12 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default function AddEmployeeForm({
  managers,
  leaveTypes,
}: {
  managers: Pick<Profile, "id" | "full_name">[];
  /** Company defaults per leave type, prefilled below and editable per person. */
  leaveTypes: LeaveDefault[];
}) {
  const [state, formAction] = useFormState(createEmployee, {} as AdminResult);
  const [pw, setPw] = useState("");
  const [gender, setGender] = useState("");
  // Parental vs maternity follows the gender picked above.
  const shownTypes = leaveTypes.filter(
    (t) => t.applies_to === "all" || t.applies_to === gender
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-3xl bg-white p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Full name
          </label>
          <input
            name="full_name"
            required
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Work email
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Temporary password
          </label>
          <div className="flex gap-2">
            <input
              name="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => setPw(randomPassword())}
              className="whitespace-nowrap rounded-lg border border-sand-200 px-3 text-xs font-medium text-sand-600 hover:bg-sand-50"
            >
              Generate
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Role
          </label>
          <select
            name="role"
            defaultValue="employee"
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Gender <span className="font-normal text-sand-500">(sets parental vs maternity leave)</span>
          </label>
          <select
            name="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Prefer not to say —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Line manager
          </label>
          <select
            name="manager_id"
            defaultValue=""
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— None —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Department
          </label>
          <input
            name="department"
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Job title
          </label>
          <input
            name="job_title"
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">
            Employment start date
          </label>
          <input
            name="employment_start_date"
            type="date"
            className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {/* Leave allowances — company defaults, adjustable for this person */}
      <fieldset className="rounded-2xl bg-sand-50 p-4">
        <legend className="px-1 text-sm font-medium text-ink-800">
          Leave per year
        </legend>
        <p className="mb-3 text-xs text-sand-600">
          Filled in with the company defaults. Change any of them for this person — it
          sticks for every leave year, not just the first.
          {gender ? "" : " Pick a gender to see parental or maternity leave."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shownTypes.map((t) => (
            <label key={t.id} className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-sand-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                {t.name}
              </span>
              <span className="flex items-center gap-2">
                <input
                  name={`days_${t.id}`}
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={t.default_days}
                  className="w-24 rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <span className="text-xs text-sand-500">days (default {t.default_days})</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

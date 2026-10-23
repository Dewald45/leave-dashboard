"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { finishOnboarding } from "@/app/(app)/account/actions";

type Step = { icon: string; title: string; body: string; hint: string };

function stepsFor(role: string): Step[] {
  const steps: Step[] = [
    {
      icon: "👋",
      title: "Welcome to TimeOff",
      body: "Book leave, see what you have left and talk to your manager, all in one place.",
      hint: "This takes about 30 seconds.",
    },
    {
      icon: "📊",
      title: "Your dashboard",
      body: "The big card is your annual leave. The small cards show sick, family and parental leave.",
      hint: "Find it under Dashboard.",
    },
    {
      icon: "🗓️",
      title: "Booking leave",
      body: "Pick your dates. We count the working days and show what you'll have left, before you send it.",
      hint: "Find it under Apply.",
    },
    {
      icon: "📎",
      title: "Add a document",
      body: "Attach a doctor's note or a signed parental leave letter. Sick leave over 2 days and parental leave need one.",
      hint: "PDF or photo, up to 5 MB.",
    },
    {
      icon: "💬",
      title: "Follow your request",
      body: "Each request has its own chat. Your manager decides, you get an email, and your calendar updates itself.",
      hint: "Find it under My requests.",
    },
  ];
  if (role !== "employee") {
    steps.push({
      icon: "✅",
      title: "Approving your team",
      body: "Requests from your team show up under Approvals. Approve or reject in one click, or straight from the email.",
      hint: "Find it under Approvals.",
    });
  }
  return steps;
}

export default function Onboarding({ role }: { role: string }) {
  const steps = stepsFor(role);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const primary = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    start(() => {
      void finishOnboarding();
    });
  };

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  if (!open) return null;
  const s = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-sand-600">
            Step {i + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={close}
            className="min-h-[40px] rounded-full px-3 text-xs font-medium text-sand-600 hover:text-ink-900"
          >
            Skip
          </button>
        </div>

        <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sand-100 text-3xl" aria-hidden="true">
          {s.icon}
        </div>
        <h2 id="onboarding-title" className="mt-4 text-xl font-bold tracking-tight text-ink-900">
          {s.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-800">{s.body}</p>
        <p className="mt-2 text-xs text-sand-600">{s.hint}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-ink-900" : "w-1.5 bg-sand-300"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 ? (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="min-h-[44px] rounded-full border border-sand-300 px-5 text-sm font-semibold text-ink-900 hover:bg-sand-50"
              >
                Back
              </button>
            ) : null}
            <button
              ref={primary}
              type="button"
              onClick={() => (last ? close() : setI(i + 1))}
              className="min-h-[44px] rounded-full bg-ink-900 px-6 text-sm font-semibold text-white hover:bg-ink-800"
            >
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

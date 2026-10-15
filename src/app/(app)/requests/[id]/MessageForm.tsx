"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { postMessage, type ActionResult } from "@/app/(app)/actions";

const MAX_BYTES = 5 * 1024 * 1024;

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[40px] rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

export default function MessageForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useFormState(postMessage, {} as ActionResult);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");

  // Clear the box after a successful send (state object changes each time).
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setFileName("");
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <label htmlFor="message-body" className="sr-only">
        Message
      </label>
      <textarea
        id="message-body"
        name="body"
        rows={3}
        maxLength={4000}
        placeholder="Ask a question, suggest other dates, share handover notes…"
        onKeyDown={(e) => {
          // Cmd/Ctrl + Enter sends.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="w-full rounded-xl border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-sand-200 px-3 text-sm text-sand-600 hover:bg-sand-50">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-4 w-4">
            <path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.6-1.7l5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="max-w-[14rem] truncate">{fileName || "Attach a file"}</span>
          <input
            type="file"
            name="attachment"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Catch big files here — past ~6 MB the upload fails before our checks run.
              if (f && f.size > MAX_BYTES) {
                e.target.value = "";
                setFileName("");
                setFileError("That file is over 5 MB — try a smaller scan or a photo.");
                return;
              }
              setFileError("");
              setFileName(f?.name ?? "");
            }}
            className="sr-only"
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-sand-500 sm:inline">⌘/Ctrl + Enter</span>
          <SendButton />
        </div>
      </div>
      {fileError || state?.error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {fileError || state.error}
        </p>
      ) : null}
    </form>
  );
}

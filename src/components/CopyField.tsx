"use client";

import { useState } from "react";

/** Read-only text with a copy-to-clipboard button. */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 font-mono text-xs text-ink-800"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard blocked — the field is selectable instead */
          }
        }}
        className="min-h-[40px] shrink-0 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

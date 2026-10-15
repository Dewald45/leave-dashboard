"use client";

import { useEffect } from "react";

/** Keep the conversation scrolled to the newest message (on load and on new posts). */
export default function ScrollToLatest({ targetId, count }: { targetId: string; count: number }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) el.scrollTop = el.scrollHeight;
  }, [targetId, count]);
  return null;
}

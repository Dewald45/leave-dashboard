"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Add TimeOff to your home screen". Uses the browser's own install prompt
 * where there is one (Chrome, Edge, Android); iPhones have no prompt, so they
 * get the Share-sheet steps instead. Hidden once it's already installed.
 */
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    const ua = navigator.userAgent;
    setDevice(/iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "desktop");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <p className="mt-2 text-sm text-ink-800">You&apos;re using the TimeOff app. Nice.</p>;
  }

  return (
    <>
      <p className="mt-2 text-sm text-ink-800">
        Put TimeOff on your phone&apos;s home screen and it opens full screen, like any
        other app — no app store needed.
      </p>
      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
          className="mt-4 min-h-[44px] rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800"
        >
          Install TimeOff
        </button>
      ) : device === "ios" ? (
        <p className="mt-3 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-ink-800">
          In Safari, tap <strong>Share</strong> (the square with the arrow), then{" "}
          <strong>Add to Home Screen</strong>.
        </p>
      ) : device === "android" ? (
        <p className="mt-3 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-ink-800">
          In Chrome, tap the <strong>⋮</strong> menu, then <strong>Add to Home screen</strong>{" "}
          or <strong>Install app</strong>.
        </p>
      ) : (
        <p className="mt-3 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-ink-800">
          Open this page on your phone. In Chrome, tap the <strong>⋮</strong> menu, then{" "}
          <strong>Add to Home screen</strong> or <strong>Install app</strong>. On iPhone,
          use Safari&apos;s <strong>Share → Add to Home Screen</strong>.
        </p>
      )}
    </>
  );
}

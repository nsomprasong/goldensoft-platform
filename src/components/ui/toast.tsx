"use client";

import { useEffect, useState } from "react";

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) {
        setMessage(detail);
      }
    }
    window.addEventListener("gs-toast", onToast as EventListener);
    return () => window.removeEventListener("gs-toast", onToast as EventListener);
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-xl bg-[var(--foreground)] px-4 py-3 text-sm text-white shadow-lg"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export function pushToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("gs-toast", { detail: message }));
}

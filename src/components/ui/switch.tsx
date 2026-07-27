"use client";

import { cn } from "@/lib/utils";

export function Switch(props: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <button
      id={props.id}
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onCheckedChange(!props.checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        props.checked
          ? "border-[var(--primary)] bg-[var(--primary)]"
          : "border-[var(--border-strong)] bg-[var(--muted)]",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          props.checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}

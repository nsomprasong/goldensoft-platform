"use client";

import { useTransition } from "react";

import { signOutAction } from "@/lib/auth/actions";
import { TH } from "@/lib/i18n/th";

export function LogoutButton({ className }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className ?? "btn"}
      disabled={pending}
      onClick={() => start(() => signOutAction())}
    >
      {TH.nav.logout}
    </button>
  );
}

"use client";

import { KeyRound, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  IconTextButton,
  LabeledIconButton,
  labeledActionSoftClassName,
} from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

/**
 * Opens (or cancels) an administrator-initiated reset window. The operator
 * never sees a password: the employee signs in with an empty password once and
 * sets their own.
 */
export function StaffPasswordResetButton(props: {
  userProfileId: string;
  openResetId: string | null;
  layout?: "labeled" | "text";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const cancelling = props.openResetId !== null;
  const layout = props.layout ?? "labeled";
  const label = pending
    ? TH.common.loading
    : cancelling
      ? TH.staff.passwordResetCancel
      : TH.staff.passwordReset;

  async function run() {
    if (!cancelling && !window.confirm(TH.staff.passwordResetConfirm)) {
      return;
    }
    setPending(true);
    const res = await fetch(
      `/api/platform/staff/${props.userProfileId}/password-reset`,
      cancelling
        ? {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resetId: props.openResetId }),
          }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
    );
    const data = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    setPending(false);
    pushToast(data?.message ?? (res.ok ? TH.common.saved : TH.common.failed));
    if (res.ok) {
      router.refresh();
    }
  }

  const icon = cancelling ? (
    <Undo2
      className={pending ? "animate-pulse" : undefined}
      aria-hidden="true"
    />
  ) : (
    <KeyRound
      className={pending ? "animate-pulse" : undefined}
      aria-hidden="true"
    />
  );

  const className = cancelling
    ? "border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] hover:border-[var(--danger)]/40 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
    : labeledActionSoftClassName;

  if (layout === "text") {
    return (
      <IconTextButton
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => void run()}
        className={className}
        icon={icon}
        label={label}
      />
    );
  }

  return (
    <LabeledIconButton
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void run()}
      className={className}
      icon={icon}
      label={label}
      stackClassName={cancelling ? "max-w-[6.5rem]" : undefined}
    />
  );
}

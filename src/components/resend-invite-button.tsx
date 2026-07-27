"use client";

import { MailPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  LabeledIconButton,
  labeledActionSoftClassName,
} from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function ResendInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const label = pending ? TH.common.loading : TH.users.reinvite;

  async function resend() {
    setPending(true);
    const response = await fetch(
      `/api/platform/users/${invitationId}/resend-invite`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    const result = (await response.json()) as { message?: string };
    setPending(false);
    pushToast(result.message ?? TH.common.failed);
    if (response.ok) {
      setSent(true);
      router.refresh();
    }
  }

  if (sent) return null;

  return (
    <LabeledIconButton
      type="button"
      variant="outline"
      disabled={pending}
      onClick={resend}
      className={labeledActionSoftClassName}
      icon={
        <MailPlus className={pending ? "animate-pulse" : undefined} aria-hidden="true" />
      }
      label={label}
    />
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function ResendInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    const response = await fetch(
      `/api/platform/users/${invitationId}/resend-invite`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    const result = (await response.json()) as { message?: string };
    setPending(false);
    pushToast(result.message ?? TH.common.failed);
    if (response.ok) router.refresh();
  }

  return (
    <button type="button" className="btn" disabled={pending} onClick={resend}>
      {pending ? TH.common.loading : TH.users.reinvite}
    </button>
  );
}

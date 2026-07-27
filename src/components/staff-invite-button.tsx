"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  IconTextButton,
  LabeledIconButton,
  labeledActionSoftClassName,
} from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

/** Send (or re-send) an access email for a GoldenSoft staff member. */
export function StaffInviteButton(props: {
  userProfileId: string;
  disabled?: boolean;
  /** Dense row actions use labeled icon; cards/forms use text+icon. */
  layout?: "labeled" | "text";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const layout = props.layout ?? "labeled";
  const label = pending ? TH.common.loading : TH.staff.invite;

  async function run() {
    if (!window.confirm(TH.staff.inviteConfirm)) {
      return;
    }
    setPending(true);
    const res = await fetch(
      `/api/platform/staff/${props.userProfileId}/invite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const data = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    setPending(false);
    pushToast(
      data?.message ?? (res.ok ? TH.staff.inviteSuccess : TH.common.failed),
    );
    if (res.ok) {
      router.refresh();
    }
  }

  const icon = (
    <Mail
      className={pending ? "animate-pulse" : undefined}
      aria-hidden="true"
    />
  );

  if (layout === "text") {
    return (
      <IconTextButton
        type="button"
        variant="outline"
        disabled={pending || props.disabled}
        onClick={() => void run()}
        className={labeledActionSoftClassName}
        icon={icon}
        label={label}
      />
    );
  }

  return (
    <LabeledIconButton
      type="button"
      variant="outline"
      disabled={pending || props.disabled}
      onClick={() => void run()}
      className={labeledActionSoftClassName}
      icon={icon}
      label={label}
    />
  );
}

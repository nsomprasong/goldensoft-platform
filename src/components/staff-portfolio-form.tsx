"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { UserPlus, UserX } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { Input } from "@/components/ui/input";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type Option = { id: string; label: string };

export function StaffPortfolioAssignForm(props: {
  staffOptions: Option[];
  organizationOptions: Option[];
}) {
  const router = useRouter();
  const [staffUserProfileId, setStaffUserProfileId] = useState(
    props.staffOptions[0]?.id ?? "",
  );
  const [organizationId, setOrganizationId] = useState(
    props.organizationOptions[0]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    if (!staffUserProfileId || !organizationId) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/platform/staff-organization-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffUserProfileId,
        organizationId,
        note: note.trim() || undefined,
      }),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(data.message ?? TH.staffPortfolio.assignSuccess);
    setNote("");
    router.refresh();
  }

  const disabled =
    pending ||
    !staffUserProfileId ||
    !organizationId ||
    props.staffOptions.length === 0 ||
    props.organizationOptions.length === 0;

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={TH.staffPortfolio.staffLabel} htmlFor="staffUserProfileId">
          <select
            id="staffUserProfileId"
            className="input"
            value={staffUserProfileId}
            onChange={(e) => setStaffUserProfileId(e.target.value)}
            disabled={props.staffOptions.length === 0}
          >
            {props.staffOptions.length === 0 ? (
              <option value="">{TH.staffPortfolio.selectStaffPlaceholder}</option>
            ) : null}
            {props.staffOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={TH.staffPortfolio.organizationLabel} htmlFor="organizationId">
          <select
            id="organizationId"
            className="input"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            disabled={props.organizationOptions.length === 0}
          >
            {props.organizationOptions.length === 0 ? (
              <option value="">{TH.staffPortfolio.selectOrgPlaceholder}</option>
            ) : null}
            {props.organizationOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={TH.staffPortfolio.noteLabel} htmlFor="note">
          <Input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={TH.staffPortfolio.noteLabel}
          />
        </FormField>
      </div>
      <IconTextButton
        type="button"
        disabled={disabled}
        onClick={() => void assign()}
        icon={
          <UserPlus
            className={pending ? "animate-pulse" : undefined}
            aria-hidden="true"
          />
        }
        label={pending ? TH.common.loading : TH.staffPortfolio.assign}
      />
    </div>
  );
}

export function StaffPortfolioRevokeButton(props: { assignmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function revoke() {
    if (!window.confirm(TH.staffPortfolio.revokeConfirm)) return;
    setPending(true);
    const res = await fetch("/api/platform/staff-organization-assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: props.assignmentId }),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      pushToast(data.message ?? TH.common.failed);
      return;
    }
    pushToast(data.message ?? TH.staffPortfolio.revokeSuccess);
    router.refresh();
  }

  return (
    <IconTextButton
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void revoke()}
      icon={
        <UserX
          className={pending ? "animate-pulse" : undefined}
          aria-hidden="true"
        />
      }
      label={pending ? TH.common.loading : TH.staffPortfolio.revoke}
    />
  );
}

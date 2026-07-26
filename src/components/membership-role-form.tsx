"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShieldOff, ShieldPlus } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function MembershipRoleAssignForm(props: {
  membershipId: string;
  roles: Array<{ id: string; code: string; nameTh: string; isSystem: boolean }>;
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(props.roles[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    if (!roleId) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/platform/memberships/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membershipId: props.membershipId,
        roleId,
      }),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="กำหนดบทบาท" htmlFor="roleId">
          <select
            id="roleId"
            className="input"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {props.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameTh} ({r.code})
                {r.isSystem ? "" : " · กำหนดเอง"}
              </option>
            ))}
          </select>
        </FormField>
        <IconTextButton
          type="button"
          disabled={pending || !roleId}
          onClick={() => void assign()}
          icon={
            <ShieldPlus
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "กำหนดบทบาท"}
        />
      </div>
    </div>
  );
}

export function RoleRevokeButton(props: { assignmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    const res = await fetch("/api/platform/memberships/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipRoleId: props.assignmentId }),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      pushToast(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.refresh();
  }

  return (
    <IconTextButton
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void revoke()}
      icon={
        <ShieldOff
          className={pending ? "animate-pulse" : undefined}
          aria-hidden="true"
        />
      }
      label={pending ? TH.common.loading : "ถอดบทบาท"}
    />
  );
}

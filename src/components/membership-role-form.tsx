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
  roles: Array<{ id: string; code: string; nameTh: string; isSystem: boolean; permissionLabels?: string[] }>;
  plain?: boolean;
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(props.roles[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRole = props.roles.find((role) => role.id === roleId) ?? null;

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
    <div className={props.plain ? "space-y-4" : "space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-xs)]"}>
      <div>
        <h4 className="font-semibold text-[var(--foreground)]">กำหนดบทบาท</h4>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">เพิ่มบทบาทองค์กรให้บัญชีผู้ใช้นี้</p>
      </div>
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
      {selectedRole ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--success-border)] bg-[var(--success-soft)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            สิทธิ์ภายในองค์กร {selectedRole.permissionLabels?.length ?? 0} รายการ
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {selectedRole.permissionLabels?.length
              ? selectedRole.permissionLabels.join(" · ")
              : "บทบาทนี้ยังไม่ได้กำหนดสิทธิ์ภายในองค์กร"}
          </p>
        </div>
      ) : null}
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

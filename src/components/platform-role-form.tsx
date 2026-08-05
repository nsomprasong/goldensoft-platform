"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShieldOff, ShieldPlus } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type PlatformRoleOption = {
  id: string;
  code: string;
  nameTh: string;
  permissionLabels?: string[];
};

export function PlatformRoleAssignForm(props: {
  userProfileId: string;
  roles: PlatformRoleOption[];
  assignedRoleIds: string[];
}) {
  const router = useRouter();
  const available = props.roles.filter(
    (role) => !props.assignedRoleIds.includes(role.id),
  );
  const [roleId, setRoleId] = useState(available[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRole = available.find((role) => role.id === roleId) ?? null;

  async function assign() {
    if (!roleId) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/platform/platform-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userProfileId: props.userProfileId,
        roleId,
      }),
    });
    const raw = await res.text();
    let data: { message?: string } = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as { message?: string };
      } catch {
        setPending(false);
        setError("กำหนดบทบาทไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
    }
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.refresh();
  }

  if (available.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        ผู้ใช้นี้ได้รับบทบาทแพลตฟอร์มครบแล้ว
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="กำหนดบทบาทแพลตฟอร์ม" htmlFor="platformRoleId">
          <select
            id="platformRoleId"
            className="input"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {available.map((role) => (
              <option key={role.id} value={role.id}>
                {role.nameTh} ({role.code})
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
          label={pending ? TH.common.loading : "กำหนดบทบาทแพลตฟอร์ม"}
        />
      </div>
      {selectedRole ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--info-border)] bg-[var(--info-soft)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            สิทธิ์ระดับแพลตฟอร์ม {selectedRole.permissionLabels?.length ?? 0} รายการ
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {selectedRole.permissionLabels?.length
              ? selectedRole.permissionLabels.join(" · ")
              : "บทบาทนี้ยังไม่ได้กำหนดสิทธิ์ระดับแพลตฟอร์ม"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformRoleRevokeButton(props: { assignmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    const res = await fetch("/api/platform/platform-roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: props.assignmentId }),
    });
    const raw = await res.text();
    let data: { message?: string } = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as { message?: string };
      } catch {
        setPending(false);
        pushToast("ถอดบทบาทไม่สำเร็จ");
        return;
      }
    }
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
      label={pending ? TH.common.loading : "ถอดบทบาทแพลตฟอร์ม"}
    />
  );
}

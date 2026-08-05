"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type Assignee = { id: string; label: string };

export function RoleAssignmentPanel(props: {
  scope: "platform" | "organization";
  roleId: string;
  assignees: Assignee[];
}) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState(props.assignees[0]?.id ?? "");
  const [pending, start] = useTransition();

  function assign() {
    if (!assigneeId) return;
    start(async () => {
      const response = await fetch(
        props.scope === "platform"
          ? "/api/platform/platform-roles"
          : "/api/platform/memberships/roles",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            props.scope === "platform"
              ? { userProfileId: assigneeId, roleId: props.roleId }
              : { membershipId: assigneeId, roleId: props.roleId },
          ),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        pushToast(body.message ?? TH.common.failed);
        return;
      }
      pushToast(TH.common.saved);
      router.refresh();
    });
  }

  return (
    <section className="card grid gap-3">
      <div>
        <h3 className="font-semibold">กำหนดบทบาทให้ผู้ใช้งานหรือพนักงาน</h3>
        <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          รายการนี้ถูกกรองตามขอบเขตของบทบาทและองค์กรที่กำลังใช้งาน
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-64 flex-1 gap-1 text-[length:var(--text-label)]">
          ผู้รับบทบาท
          <select className="input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={pending || props.assignees.length === 0}>
            {props.assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.label}</option>)}
          </select>
        </label>
        <IconTextButton type="button" onClick={assign} disabled={pending || !assigneeId} label={pending ? TH.common.loading : "กำหนดบทบาท"} />
      </div>
    </section>
  );
}

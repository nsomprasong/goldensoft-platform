"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCheck, UserX } from "lucide-react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type Assignee = { id: string; label: string };
type AssignedAssignee = Assignee & { assignmentId: string };

export function RoleAssignmentPanel(props: {
  scope: "platform" | "organization";
  roleId: string;
  roleName?: string;
  assignees: Assignee[];
  assigned?: AssignedAssignee[];
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

  function revoke(assignmentId: string) {
    start(async () => {
      const response = await fetch(
        props.scope === "platform"
          ? "/api/platform/platform-roles"
          : "/api/platform/memberships/roles",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            props.scope === "platform"
              ? { assignmentId }
              : { membershipRoleId: assignmentId },
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
      <div className="flex items-start gap-3">
        <span className="nav-icon-idle-organization inline-flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
          <UserRoundCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">
            ผู้ได้รับบทบาท{props.roleName ? ` · ${props.roleName}` : ""}
          </h3>
          <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            เพิ่มหรือถอดผู้ใช้ในขอบเขตปัจจุบัน
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 shadow-[inset_0_0_0_1px_var(--surface)]">
        <label className="grid min-w-64 flex-1 gap-1 text-[length:var(--text-label)]">
          ผู้รับบทบาท
          <select className="input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={pending || props.assignees.length === 0}>
            {props.assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.label}</option>)}
          </select>
        </label>
        <IconTextButton type="button" onClick={assign} disabled={pending || !assigneeId} label={pending ? TH.common.loading : "กำหนดบทบาท"} />
      </div>
      <div className="border-t border-[var(--border)] pt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium">ผู้ที่ได้รับบทบาทแล้ว</h4>
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">{props.assigned?.length ?? 0} คน</span>
        </div>
        {(props.assigned?.length ?? 0) > 0 ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {props.assigned?.map((assignee) => (
              <li key={assignee.assignmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[length:var(--text-helper)]">
                <span>{assignee.label}</span>
                <IconTextButton
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  icon={<UserX className="size-4" aria-hidden="true" />}
                  label="ถอดบทบาท"
                  onClick={() => revoke(assignee.assignmentId)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[length:var(--text-helper)] text-[var(--text-muted)]">ยังไม่มีผู้ใช้งานหรือพนักงานที่ได้รับบทบาทนี้</p>
        )}
      </div>
    </section>
  );
}

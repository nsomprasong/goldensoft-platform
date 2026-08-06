"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Building2, UserPlus, UserX } from "lucide-react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type StaffOption = { id: string; label: string };
type OrganizationOption = { id: string; name: string };
type Assignment = { id: string; organizationId: string; staffUserProfileId: string; staffLabel: string; note: string | null };

export function CustomerAssignmentPanel(props: {
  organizations: OrganizationOption[];
  staffOptions: StaffOption[];
  assignments: Assignment[];
  canManage: boolean;
  canTransfer: boolean;
}) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(props.staffOptions[0]?.id ?? "");
  const [organizationId, setOrganizationId] = useState(props.organizations[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const selectedOrganization = props.organizations.find((organization) => organization.id === organizationId) ?? null;
  const visibleAssignments = useMemo(
    () => props.assignments.filter((assignment) => assignment.organizationId === organizationId),
    [organizationId, props.assignments],
  );

  function mutate(method: "POST" | "PATCH" | "DELETE", body: object) {
    startTransition(async () => {
      const response = await fetch("/api/platform/staff-organization-assignments", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) return pushToast(result.message ?? TH.common.failed);
      pushToast(result.message ?? TH.common.saved);
      router.refresh();
    });
  }

  return (
    <section className="card grid gap-4">
      <div className="flex items-start gap-3">
        <span className="nav-icon-idle-services inline-flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">ผู้รับผิดชอบองค์กรลูกค้า</h3>
          <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
            เลือกองค์กรเพื่อจัดการผู้รับผิดชอบและทีม Support
          </p>
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 shadow-[inset_0_0_0_1px_var(--surface)]">
        <label className="grid gap-1 text-[length:var(--text-label)]">
          องค์กรลูกค้า
          <select
            className="input"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            disabled={pending || props.organizations.length === 0}
          >
            {props.organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>
      </div>
      {selectedOrganization ? (
        <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          กำลังจัดการผู้รับผิดชอบของ {selectedOrganization.name}
        </p>
      ) : (
        <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">ไม่พบองค์กรลูกค้าที่มีสิทธิ์จัดการ</p>
      )}
      <ul className="grid gap-3 xl:grid-cols-2">
        {visibleAssignments.map((assignment, index) => (
          <li key={assignment.id} className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <p className="font-medium">{assignment.staffLabel}</p>
              <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {index === 0 ? "ผู้รับผิดชอบหลัก" : "ผู้รับผิดชอบร่วม / Support"} · ทุกสาขาปัจจุบันและอนาคต
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {props.canTransfer && index === 0 ? (
                <IconTextButton type="button" variant="outline" disabled={pending || !staffId} icon={<ArrowRightLeft aria-hidden="true" />} label="โอนผู้รับผิดชอบ" onClick={() => mutate("PATCH", { assignmentId: assignment.id, targetStaffUserProfileId: staffId })} />
              ) : null}
              {props.canManage ? (
                <IconTextButton type="button" variant="outline" disabled={pending} icon={<UserX aria-hidden="true" />} label="ถอนการมอบหมาย" onClick={() => mutate("DELETE", { assignmentId: assignment.id })} />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {props.canManage ? (
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 shadow-[inset_0_0_0_1px_var(--surface)]">
          <label className="grid min-w-64 flex-1 gap-1 text-[length:var(--text-label)]">
            พนักงาน GoldenSoft
            <select className="input" value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={pending}>
              {props.staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.label}</option>)}
            </select>
          </label>
          <IconTextButton type="button" disabled={pending || !staffId || !organizationId} icon={<UserPlus aria-hidden="true" />} label="เพิ่มผู้รับผิดชอบ" onClick={() => mutate("POST", { organizationId, staffUserProfileId: staffId })} />
        </div>
      ) : null}
    </section>
  );
}

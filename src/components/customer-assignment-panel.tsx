"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, UserPlus, UserX } from "lucide-react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type StaffOption = { id: string; label: string };
type Assignment = { id: string; staffUserProfileId: string; staffLabel: string; note: string | null };

export function CustomerAssignmentPanel(props: {
  organizationId: string;
  organizationName: string;
  staffOptions: StaffOption[];
  assignments: Assignment[];
  canManage: boolean;
  canTransfer: boolean;
}) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(props.staffOptions[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

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
      <div>
        <h3 className="font-semibold">ผู้รับผิดชอบองค์กรลูกค้า</h3>
        <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {props.organizationName} · ผู้รับผิดชอบหลัก ผู้รับผิดชอบร่วม และทีม Support ใช้สิทธิ์ตามบทบาทแพลตฟอร์ม ขอบเขตสาขา และผลิตภัณฑ์ที่เปิดใช้
        </p>
      </div>
      <ul className="grid gap-2">
        {props.assignments.map((assignment, index) => (
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
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-4">
          <label className="grid min-w-64 flex-1 gap-1 text-[length:var(--text-label)]">
            พนักงาน GoldenSoft
            <select className="input" value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={pending}>
              {props.staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.label}</option>)}
            </select>
          </label>
          <IconTextButton type="button" disabled={pending || !staffId} icon={<UserPlus aria-hidden="true" />} label="เพิ่มผู้รับผิดชอบ" onClick={() => mutate("POST", { organizationId: props.organizationId, staffUserProfileId: staffId })} />
        </div>
      ) : null}
    </section>
  );
}

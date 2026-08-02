"use client";

import { useMemo, useState, useTransition } from "react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import {
  DATA_RESET_CONFIRM_PHRASE,
  type DataResetPreview,
  type DataResetTargetOrg,
} from "@/lib/ops/data-reset-types";
import { TH } from "@/lib/i18n/th";

export function DataResetPanel(props: {
  targets: DataResetTargetOrg[];
  confirmPhrase: string;
}) {
  const [selectAll, setSelectAll] = useState(false);
  const [orgIds, setOrgIds] = useState<Set<string>>(new Set());
  const [branchIds, setBranchIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<DataResetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectableOrgs = useMemo(
    () => props.targets.filter((org) => !org.protected),
    [props.targets],
  );

  function toggleOrg(org: DataResetTargetOrg, checked: boolean) {
    if (org.protected) return;
    setSelectAll(false);
    setPreview(null);
    setOrgIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(org.id);
      else next.delete(org.id);
      return next;
    });
    // Selecting an org implies its branches; clear standalone branch picks for that org.
    setBranchIds((prev) => {
      const next = new Set(prev);
      for (const branch of org.branches) next.delete(branch.id);
      return next;
    });
  }

  function toggleBranch(
    org: DataResetTargetOrg,
    branchId: string,
    checked: boolean,
  ) {
    if (org.protected || orgIds.has(org.id)) return;
    setSelectAll(false);
    setPreview(null);
    setBranchIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(branchId);
      else next.delete(branchId);
      return next;
    });
  }

  function onSelectAll(checked: boolean) {
    setSelectAll(checked);
    setPreview(null);
    if (checked) {
      setOrgIds(new Set(selectableOrgs.map((org) => org.id)));
      setBranchIds(new Set());
    } else {
      setOrgIds(new Set());
      setBranchIds(new Set());
    }
  }

  function run(action: "preview" | "apply") {
    setError(null);
    start(async () => {
      const res = await fetch("/api/platform/data-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          selectAll,
          organizationIds: [...orgIds],
          branchIds: [...branchIds],
          confirmPhrase: confirm,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        preview?: DataResetPreview;
      };
      if (!res.ok) {
        const message = data.message ?? TH.common.failed;
        setError(message);
        pushToast(message);
        return;
      }
      if (data.preview) setPreview(data.preview);
      if (action === "apply") {
        pushToast(data.message ?? "ล้างข้อมูลเรียบร้อย");
        setConfirm("");
        window.location.reload();
      }
    });
  }

  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={selectAll}
          disabled={pending}
          onChange={(e) => onSelectAll(e.target.checked)}
        />
        <span>
          <strong>เลือกทั้งหมด</strong>
          <span className="mt-1 block text-[length:var(--text-helper)] text-[var(--text-secondary)]">
            ลบทุกองค์กร/สาขาที่เกี่ยวข้อง เหลือเฉพาะองค์กร GOLDENSOFT และบัญชีผู้ดูแลระบบสูงสุด
          </span>
        </span>
      </label>

      <div className="grid gap-3">
        {props.targets.map((org) => (
          <section
            key={org.id}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3"
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectAll || orgIds.has(org.id)}
                disabled={pending || org.protected || selectAll}
                onChange={(e) => toggleOrg(org, e.target.checked)}
              />
              <span>
                <strong>
                  {org.displayName}{" "}
                  <span className="text-[var(--text-secondary)]">
                    ({org.customerCode})
                  </span>
                </strong>
                {org.protected ? (
                  <span className="mt-1 block text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                    องค์กรระบบ — ไม่สามารถลบได้
                  </span>
                ) : null}
              </span>
            </label>
            {!org.protected && org.branches.length > 0 ? (
              <ul className="mt-3 ml-7 grid gap-2">
                {org.branches.map((branch) => (
                  <li key={branch.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          selectAll ||
                          orgIds.has(org.id) ||
                          branchIds.has(branch.id)
                        }
                        disabled={
                          pending ||
                          selectAll ||
                          orgIds.has(org.id) ||
                          branch.protected
                        }
                        onChange={(e) =>
                          toggleBranch(org, branch.id, e.target.checked)
                        }
                      />
                      <span>
                        {branch.name}{" "}
                        <span className="text-[var(--text-secondary)]">
                          ({branch.code})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {preview ? (
        <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-[length:var(--text-helper)]">
          <p className="font-semibold">
            ตัวอย่างผลลัพธ์ ({preview.mode === "reset_all" ? "เลือกทั้งหมด" : "เลือกบางส่วน"})
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>องค์กรที่จะลบ: {preview.organizations.length}</li>
            <li>สาขาเพิ่มเติม: {preview.branches.length}</li>
            <li>โปรไฟล์ที่ไม่มีองค์กรเหลือ: {preview.orphanProfiles.length}</li>
            <li>
              คงไว้: {preview.keptOrganizationCodes.join(", ")} / SUPER_ADMIN{" "}
              {preview.keptSuperAdminEmails.length} บัญชี
            </li>
          </ul>
          {preview.warnings.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-[var(--danger)]">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <label className="grid gap-1 text-sm">
        <span>
          พิมพ์ <strong>{props.confirmPhrase || DATA_RESET_CONFIRM_PHRASE}</strong>{" "}
          เพื่อยืนยันการลบจริง
        </span>
        <input
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          value={confirm}
          disabled={pending}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
      </label>

      {error ? (
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <IconTextButton
          type="button"
          disabled={pending}
          onClick={() => run("preview")}
          label="ดูตัวอย่างก่อนลบ"
        />
        <IconTextButton
          type="button"
          disabled={
            pending ||
            confirm.trim() !== (props.confirmPhrase || DATA_RESET_CONFIRM_PHRASE)
          }
          onClick={() => {
            if (
              !window.confirm(
                "ยืนยันล้างข้อมูลที่เลือก? การกระทำนี้ย้อนกลับไม่ได้",
              )
            ) {
              return;
            }
            run("apply");
          }}
          label={pending ? "กำลังลบ..." : "ล้างข้อมูลที่เลือก"}
        />
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Save } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function BranchScopeForm(props: {
  membershipId: string;
  branches: Array<{ id: string; code: string; name: string }>;
  initialScopeType: string;
  initialBranchIds: string[];
}) {
  const router = useRouter();
  const [scopeType, setScopeType] = useState(props.initialScopeType || "NONE");
  const [selected, setSelected] = useState<string[]>(props.initialBranchIds);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/platform/memberships/branch-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membershipId: props.membershipId,
        scopeTypeCode: scopeType,
        branchIds: scopeType === "SELECTED" ? selected : [],
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
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-xs)]">
      <div>
        <h4 className="font-semibold text-[var(--foreground)]">ขอบเขตสาขา</h4>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">กำหนดสาขาที่ผู้ใช้นี้สามารถเข้าถึงได้</p>
      </div>
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <FormField label="ประเภทขอบเขต" htmlFor={`scope-${props.membershipId}`}>
        <select
          id={`scope-${props.membershipId}`}
          className="input"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
        >
          <option value="ALL_BRANCHES">ทุกสาขา</option>
          <option value="SELECTED">เฉพาะสาขาที่เลือก</option>
          <option value="NONE">ไม่มีสาขา</option>
        </select>
      </FormField>
      {scopeType === "SELECTED" ? (
        <fieldset className="space-y-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
          <legend className="text-sm font-medium">เลือกสาขา</legend>
          {props.branches.map((b) => {
            const checked = selected.includes(b.id);
            return (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, b.id]
                        : prev.filter((id) => id !== b.id),
                    );
                  }}
                />
                {b.code} — {b.name}
              </label>
            );
          })}
        </fieldset>
      ) : null}
      <IconTextButton
        type="button"
        disabled={pending}
        onClick={() => void save()}
        icon={
          <Save
            className={pending ? "animate-pulse" : undefined}
            aria-hidden="true"
          />
        }
        label={pending ? TH.common.loading : "บันทึกขอบเขตสาขา"}
      />
    </div>
  );
}

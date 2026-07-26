"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";

export type PlanFeatureOption = {
  code: string;
  name: string;
  valueKind: "boolean" | "numeric" | "text";
  defaultLimitValue: string | null;
};

export type PlanFeatureSelection = {
  featureCode: string;
  limitValue: string | null;
};

function serializeFeatures(rows: PlanFeatureSelection[]): PlanFeatureSelection[] {
  return [...rows]
    .map((r) => ({
      featureCode: r.featureCode,
      limitValue:
        r.limitValue == null || r.limitValue.trim() === ""
          ? null
          : r.limitValue.trim(),
    }))
    .sort((a, b) => a.featureCode.localeCompare(b.featureCode));
}

export function PlanFeatureMatrix(props: {
  catalog: PlanFeatureOption[];
  value: PlanFeatureSelection[];
  onChange: (next: PlanFeatureSelection[]) => void;
}) {
  const [addCode, setAddCode] = useState("");
  const selectedCodes = useMemo(
    () => new Set(props.value.map((v) => v.featureCode)),
    [props.value],
  );
  const available = props.catalog.filter((c) => !selectedCodes.has(c.code));
  const preview = serializeFeatures(props.value);

  function upsert(featureCode: string, limitValue: string | null) {
    const next = props.value.filter((v) => v.featureCode !== featureCode);
    next.push({ featureCode, limitValue });
    props.onChange(serializeFeatures(next));
  }

  function remove(featureCode: string) {
    props.onChange(
      serializeFeatures(props.value.filter((v) => v.featureCode !== featureCode)),
    );
  }

  function addSelected() {
    if (!addCode) return;
    if (selectedCodes.has(addCode)) return;
    const item = props.catalog.find((c) => c.code === addCode);
    if (!item) return;
    upsert(item.code, item.defaultLimitValue);
    setAddCode("");
  }

  return (
    <div className="space-y-3 rounded border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">คุณสมบัติและลิมิต</h4>
          <p className="text-xs text-[var(--text-secondary)]">
            เลือกจากแคตตาล็อกเท่านั้น — ห้ามพิมพ์รหัสอิสระ
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block">เพิ่มคุณสมบัติ</span>
            <select
              className="input"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
            >
              <option value="">เลือกจากแคตตาล็อก</option>
              {available.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
          </label>
          <IconTextButton
            type="button"
            variant="outline"
            disabled={!addCode}
            onClick={addSelected}
            icon={<Plus aria-hidden="true" />}
            label="เพิ่ม"
          />
        </div>
      </div>

      {props.value.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          ยังไม่ได้เลือกคุณสมบัติ
        </p>
      ) : (
        <ul className="space-y-2">
          {props.value.map((row) => {
            const meta = props.catalog.find((c) => c.code === row.featureCode);
            if (!meta) return null;
            return (
              <li
                key={row.featureCode}
                className="grid gap-2 rounded border border-[var(--border)] p-2 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <div className="text-sm font-medium">{meta.name}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {meta.code}
                  </div>
                </div>
                <div>
                  {meta.valueKind === "boolean" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.limitValue !== "false"}
                        onChange={(e) =>
                          upsert(
                            row.featureCode,
                            e.target.checked ? "true" : "false",
                          )
                        }
                      />
                      เปิดใช้งาน
                    </label>
                  ) : (
                    <Input
                      type={meta.valueKind === "numeric" ? "number" : "text"}
                      min={meta.valueKind === "numeric" ? 0 : undefined}
                      value={row.limitValue ?? ""}
                      onChange={(e) =>
                        upsert(row.featureCode, e.target.value || null)
                      }
                      placeholder={
                        meta.valueKind === "numeric" ? "ลิมิตตัวเลข" : "ค่า"
                      }
                    />
                  )}
                </div>
                <IconTextButton
                  type="button"
                  variant="outline"
                  onClick={() => remove(row.featureCode)}
                  icon={<Trash2 aria-hidden="true" />}
                  label="ลบ"
                />
              </li>
            );
          })}
        </ul>
      )}

      <details>
        <summary className="cursor-pointer text-sm text-[var(--text-secondary)]">
          ตัวอย่างก่อนบันทึก
        </summary>
        <ul className="mt-2 space-y-1 text-sm">
          {preview.length === 0 ? (
            <li>—</li>
          ) : (
            preview.map((p) => (
              <li key={p.featureCode}>
                {p.featureCode} = {p.limitValue ?? "null"}
              </li>
            ))
          )}
        </ul>
      </details>
    </div>
  );
}

export function featuresPayload(
  rows: PlanFeatureSelection[],
): PlanFeatureSelection[] {
  return serializeFeatures(rows);
}

"use client";

import { Copy, Pause, Play, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  featuresPayload,
  PlanFeatureMatrix,
  type PlanFeatureOption,
  type PlanFeatureSelection,
} from "@/components/plan-feature-matrix";
import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function PlanForm(props: {
  mode: "create" | "edit";
  planId?: string;
  products: Array<{ id: string; code: string; name: string }>;
  billingCycles: Array<{ code: string; nameTh: string }>;
  featureCatalogByProductId?: Record<string, PlanFeatureOption[]>;
  initial?: {
    productId: string;
    code: string;
    name: string;
    description: string | null;
    sortOrder: number;
    billingCycleCode?: string;
    basePrice?: number;
    currency?: string;
    trialDays?: number;
    features?: PlanFeatureSelection[];
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [productId, setProductId] = useState(props.initial?.productId ?? "");
  const [features, setFeatures] = useState<PlanFeatureSelection[]>(
    props.initial?.features ?? [],
  );

  const catalog = useMemo(() => {
    if (!productId || !props.featureCatalogByProductId) return [];
    return props.featureCatalogByProductId[productId] ?? [];
  }, [productId, props.featureCatalogByProductId]);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    if (props.mode === "create") {
      const selectedProductId = String(formData.get("productId") ?? productId);
      const payload = {
        productId: selectedProductId,
        code: String(formData.get("code") ?? "")
          .trim()
          .toUpperCase(),
        name: String(formData.get("name") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
        billingCycleCode: String(formData.get("billingCycleCode") ?? ""),
        basePrice: Number(formData.get("basePrice") ?? 0),
        currency: String(formData.get("currency") ?? "THB"),
        trialDays: Number(formData.get("trialDays") ?? 0),
        sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
        features: featuresPayload(features),
      };
      if (payload.features.length === 0) {
        setPending(false);
        setError("ต้องเลือกอย่างน้อยหนึ่งคุณสมบัติ");
        return;
      }
      const codes = new Set(payload.features.map((f) => f.featureCode));
      if (codes.size !== payload.features.length) {
        setPending(false);
        setError("พบรหัสคุณสมบัติซ้ำ");
        return;
      }
      const res = await fetch("/api/platform/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        message?: string;
        plan?: { id: string };
      };
      setPending(false);
      if (!res.ok) {
        setError(data.message ?? TH.common.failed);
        return;
      }
      pushToast(TH.common.saved);
      router.push(`/plans/${data.plan?.id}`);
      router.refresh();
      return;
    }

    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    };
    const res = await fetch(`/api/platform/plans/${props.planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.push(`/plans/${props.planId}`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {props.mode === "create" ? (
        <FormField label="ผลิตภัณฑ์" htmlFor="productId" required>
          <select
            id="productId"
            name="productId"
            required
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setFeatures([]);
            }}
            className="input"
          >
            <option value="">เลือกผลิตภัณฑ์</option>
            {props.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}
      <FormField label="รหัสแพ็กเกจ" htmlFor="code" required>
        <Input
          id="code"
          name="code"
          required={props.mode === "create"}
          disabled={props.mode === "edit"}
          defaultValue={props.initial?.code ?? ""}
          className="disabled:bg-[var(--surface-muted)]"
        />
      </FormField>
      <FormField label="ชื่อแพ็กเกจ" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          required
          defaultValue={props.initial?.name ?? ""}
        />
      </FormField>
      {props.mode === "create" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="รอบบิล" htmlFor="billingCycleCode" required>
            <select
              id="billingCycleCode"
              name="billingCycleCode"
              required
              defaultValue={props.initial?.billingCycleCode ?? "MONTHLY"}
              className="input"
            >
              {props.billingCycles.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nameTh}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ราคา" htmlFor="basePrice" required>
            <Input
              id="basePrice"
              name="basePrice"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={props.initial?.basePrice ?? 0}
            />
          </FormField>
          <FormField label="สกุลเงิน" htmlFor="currency">
            <Input
              id="currency"
              name="currency"
              defaultValue={props.initial?.currency ?? "THB"}
            />
          </FormField>
          <FormField label="วันทดลองใช้" htmlFor="trialDays">
            <Input
              id="trialDays"
              name="trialDays"
              type="number"
              min={0}
              defaultValue={props.initial?.trialDays ?? 0}
            />
          </FormField>
        </div>
      ) : null}
      <FormField label="ลำดับการแสดง" htmlFor="sortOrder">
        <Input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={props.initial?.sortOrder ?? 0}
        />
      </FormField>
      <FormField label="คำอธิบาย" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={props.initial?.description ?? ""}
          className="input"
        />
      </FormField>
      {props.mode === "create" ? (
        <PlanFeatureMatrix
          catalog={catalog}
          value={features}
          onChange={setFeatures}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <IconTextButton
          type="submit"
          disabled={pending}
          icon={
            <Save
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : TH.common.save}
        />
        <IconTextButton
          type="button"
          variant="outline"
          onClick={() => router.back()}
          icon={<X aria-hidden="true" />}
          label={TH.common.cancel}
        />
      </div>
    </form>
  );
}

export function PlanStatusActions(props: {
  planId: string;
  statusCode: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: "activate" | "deactivate" | "duplicate") {
    setPending(true);
    const res = await fetch(`/api/platform/plans/${props.planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
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
    <div className="flex flex-wrap items-center gap-2">
      {props.statusCode !== "ACTIVE" ? (
        <IconTextButton
          type="button"
          disabled={pending}
          onClick={() => void run("activate")}
          icon={
            <Play
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "เปิดใช้งาน"}
        />
      ) : (
        <IconTextButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void run("deactivate")}
          icon={
            <Pause
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "ปิดใช้งาน"}
        />
      )}
      <IconTextButton
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => void run("duplicate")}
        icon={
          <Copy
            className={pending ? "animate-pulse" : undefined}
            aria-hidden="true"
          />
        }
        label={pending ? TH.common.loading : "สร้างเวอร์ชันใหม่"}
      />
    </div>
  );
}

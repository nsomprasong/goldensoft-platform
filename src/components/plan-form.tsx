"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/ui/admin-ui";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function PlanForm(props: {
  mode: "create" | "edit";
  planId?: string;
  products: Array<{ id: string; code: string; name: string }>;
  billingCycles: Array<{ code: string; nameTh: string }>;
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
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    if (props.mode === "create") {
      const payload = {
        productId: String(formData.get("productId") ?? ""),
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
        features: [],
      };
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
            defaultValue={props.initial?.productId ?? ""}
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
        <input
          id="code"
          name="code"
          required={props.mode === "create"}
          disabled={props.mode === "edit"}
          defaultValue={props.initial?.code ?? ""}
          className="input disabled:bg-[var(--surface-muted)]"
        />
      </FormField>
      <FormField label="ชื่อแพ็กเกจ" htmlFor="name" required>
        <input
          id="name"
          name="name"
          required
          defaultValue={props.initial?.name ?? ""}
          className="input"
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
            <input
              id="basePrice"
              name="basePrice"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={props.initial?.basePrice ?? 0}
              className="input"
            />
          </FormField>
          <FormField label="สกุลเงิน" htmlFor="currency">
            <input
              id="currency"
              name="currency"
              defaultValue={props.initial?.currency ?? "THB"}
              className="input"
            />
          </FormField>
          <FormField label="วันทดลองใช้" htmlFor="trialDays">
            <input
              id="trialDays"
              name="trialDays"
              type="number"
              min={0}
              defaultValue={props.initial?.trialDays ?? 0}
              className="input"
            />
          </FormField>
        </div>
      ) : null}
      <FormField label="ลำดับการแสดง" htmlFor="sortOrder">
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={props.initial?.sortOrder ?? 0}
          className="input"
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
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? TH.common.loading : TH.common.save}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => router.back()}
        >
          {TH.common.cancel}
        </button>
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
    <div className="flex flex-wrap gap-2">
      {props.statusCode !== "ACTIVE" ? (
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => void run("activate")}
        >
          เปิดใช้งาน
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => void run("deactivate")}
        >
          ปิดใช้งาน
        </button>
      )}
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() => void run("duplicate")}
      >
        สร้างเวอร์ชันใหม่
      </button>
    </div>
  );
}

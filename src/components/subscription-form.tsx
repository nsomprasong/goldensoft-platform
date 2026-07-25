"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/ui/admin-ui";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function SubscriptionForm(props: {
  organizations: Array<{ id: string; label: string }>;
  products: Array<{
    id: string;
    code: string;
    name: string;
    plans: Array<{ code: string; name: string }>;
  }>;
  billingCycles: Array<{ code: string; nameTh: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [productCode, setProductCode] = useState(
    props.products[0]?.code ?? "",
  );
  const selected = props.products.find((p) => p.code === productCode);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload = {
      organizationId: String(formData.get("organizationId") ?? ""),
      productCode: String(formData.get("productCode") ?? ""),
      planCode: String(formData.get("planCode") ?? ""),
      billingCycleCode: String(formData.get("billingCycleCode") ?? ""),
      statusCode: String(formData.get("statusCode") ?? "ACTIVE"),
      idempotencyKey: `sub-create:${crypto.randomUUID()}`,
    };
    const res = await fetch("/api/platform/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      message?: string;
      subscriptionId?: string;
    };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.push(`/subscriptions/${data.subscriptionId}`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <FormField label="องค์กร" htmlFor="organizationId" required>
        <select
          id="organizationId"
          name="organizationId"
          required
          className="input"
        >
          <option value="">เลือกองค์กร</option>
          {props.organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="ผลิตภัณฑ์" htmlFor="productCode" required>
        <select
          id="productCode"
          name="productCode"
          required
          className="input"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
        >
          {props.products.map((p) => (
            <option key={p.id} value={p.code}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="แพ็กเกจ" htmlFor="planCode" required>
        <select id="planCode" name="planCode" required className="input">
          {(selected?.plans ?? []).map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="รอบบิล" htmlFor="billingCycleCode" required>
          <select
            id="billingCycleCode"
            name="billingCycleCode"
            required
            defaultValue="MONTHLY"
            className="input"
          >
            {props.billingCycles.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameTh}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="สถานะเริ่มต้น" htmlFor="statusCode">
          <select
            id="statusCode"
            name="statusCode"
            defaultValue="TRIAL"
            className="input"
          >
            <option value="TRIAL">ทดลองใช้</option>
            <option value="ACTIVE">ใช้งาน</option>
          </select>
        </FormField>
      </div>
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

export function SubscriptionActions(props: {
  subscriptionId: string;
  statusCode: string;
  plans: Array<{ code: string; name: string }>;
  canManage: boolean;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [planCode, setPlanCode] = useState(props.plans[0]?.code ?? "");
  const [endsAt, setEndsAt] = useState("");

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setPending(true);
    const res = await fetch(
      `/api/platform/subscriptions/${props.subscriptionId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      },
    );
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      pushToast(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.refresh();
  }

  if (!props.canManage && !props.canRegenerate) return null;

  return (
    <div className="space-y-3">
      {props.canManage ? (
        <div className="flex flex-wrap gap-2">
          {["TRIAL", "SUSPENDED", "PAST_DUE"].includes(props.statusCode) ? (
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => void run("activate")}
            >
              เปิดใช้งาน
            </button>
          ) : null}
          {["ACTIVE", "TRIAL", "PAST_DUE"].includes(props.statusCode) ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => void run("suspend")}
            >
              ระงับ
            </button>
          ) : null}
          {props.statusCode === "SUSPENDED" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => void run("resume")}
            >
              กลับมาใช้งาน
            </button>
          ) : null}
          {!["CANCELLED", "EXPIRED"].includes(props.statusCode) ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => void run("cancel")}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => void run("expire")}
              >
                หมดอายุ
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {props.canManage && props.plans.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="เปลี่ยนแพ็กเกจ" htmlFor="changePlan">
            <select
              id="changePlan"
              className="input"
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
            >
              {props.plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !planCode}
            onClick={() =>
              void run("change_plan", {
                planCode,
                idempotencyKey: `change:${props.subscriptionId}:${planCode}:${Date.now()}`,
              })
            }
          >
            เปลี่ยนแพ็กเกจ
          </button>
        </div>
      ) : null}

      {props.canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="ขยายวันสิ้นสุด" htmlFor="endsAt">
            <input
              id="endsAt"
              type="datetime-local"
              className="input"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </FormField>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending || !endsAt}
            onClick={() =>
              void run("extend", { endsAt: new Date(endsAt).toISOString() })
            }
          >
            ขยายวันสิ้นสุด
          </button>
        </div>
      ) : null}

      {props.canRegenerate ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => void run("regenerate_entitlements")}
        >
          สร้างสิทธิ์การใช้งานใหม่
        </button>
      ) : null}
    </div>
  );
}

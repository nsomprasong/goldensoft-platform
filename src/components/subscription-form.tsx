"use client";

import {
  ArrowLeftRight,
  Ban,
  CalendarPlus,
  Pause,
  Play,
  RotateCcw,
  Save,
  TimerOff,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
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
        <div className="flex flex-wrap items-center gap-2">
          {["TRIAL", "SUSPENDED", "PAST_DUE"].includes(props.statusCode) ? (
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
          ) : null}
          {["ACTIVE", "TRIAL", "PAST_DUE"].includes(props.statusCode) ? (
            <IconTextButton
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void run("suspend")}
              icon={
                <Pause
                  className={pending ? "animate-pulse" : undefined}
                  aria-hidden="true"
                />
              }
              label={pending ? TH.common.loading : "ระงับ"}
            />
          ) : null}
          {props.statusCode === "SUSPENDED" ? (
            <IconTextButton
              type="button"
              disabled={pending}
              onClick={() => void run("resume")}
              icon={
                <Play
                  className={pending ? "animate-pulse" : undefined}
                  aria-hidden="true"
                />
              }
              label={pending ? TH.common.loading : "กลับมาใช้งาน"}
            />
          ) : null}
          {!["CANCELLED", "EXPIRED"].includes(props.statusCode) ? (
            <>
              <IconTextButton
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void run("cancel")}
                icon={
                  <Ban
                    className={pending ? "animate-pulse" : undefined}
                    aria-hidden="true"
                  />
                }
                label={pending ? TH.common.loading : "ยกเลิก"}
              />
              <IconTextButton
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void run("expire")}
                icon={
                  <TimerOff
                    className={pending ? "animate-pulse" : undefined}
                    aria-hidden="true"
                  />
                }
                label={pending ? TH.common.loading : "หมดอายุ"}
              />
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
          <IconTextButton
            type="button"
            disabled={pending || !planCode}
            onClick={() =>
              void run("change_plan", {
                planCode,
                idempotencyKey: `change:${props.subscriptionId}:${planCode}:${Date.now()}`,
              })
            }
            icon={
              <ArrowLeftRight
                className={pending ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={pending ? TH.common.loading : "เปลี่ยนแพ็กเกจ"}
          />
        </div>
      ) : null}

      {props.canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="ขยายวันสิ้นสุด" htmlFor="endsAt">
            <Input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </FormField>
          <IconTextButton
            type="button"
            variant="outline"
            disabled={pending || !endsAt}
            onClick={() =>
              void run("extend", { endsAt: new Date(endsAt).toISOString() })
            }
            icon={
              <CalendarPlus
                className={pending ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={pending ? TH.common.loading : "ขยายวันสิ้นสุด"}
          />
        </div>
      ) : null}

      {props.canRegenerate ? (
        <IconTextButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void run("regenerate_entitlements")}
          icon={
            <RotateCcw
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "สร้างสิทธิ์การใช้งานใหม่"}
        />
      ) : null}
    </div>
  );
}

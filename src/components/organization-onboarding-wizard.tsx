"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ProductOption = { code: string; name: string };
type PlanOption = { code: string; name: string; productCode: string };

const STEPS = [
  "ข้อมูลองค์กร",
  "สาขาหลัก",
  "เจ้าขององค์กร",
  "ผลิตภัณฑ์",
  "แพ็กเกจ",
  "ยืนยัน",
] as const;

export function OrganizationOnboardingWizard(props: {
  products: ProductOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(
    () => `onboard-${crypto.randomUUID()}`,
  );

  const [organization, setOrganization] = useState({
    customerCode: "",
    slug: "",
    displayName: "",
    legalName: "",
    taxId: "",
    email: "",
  });
  const [primaryBranch, setPrimaryBranch] = useState({
    code: "HQ",
    name: "สำนักงานใหญ่",
    address: "",
  });
  const [owner, setOwner] = useState({
    email: "",
    displayName: "",
  });
  const [productCode, setProductCode] = useState(props.products[0]?.code ?? "");
  const [planCode, setPlanCode] = useState("");
  const [subscriptionMode, setSubscriptionMode] = useState<"TRIAL" | "ACTIVE">(
    "TRIAL",
  );

  const plansForProduct = props.plans.filter((p) => p.productCode === productCode);

  function next() {
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/platform/organizations/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          organization: {
            ...organization,
            taxId: organization.taxId || null,
            email: organization.email || null,
          },
          primaryBranch: {
            ...primaryBranch,
            address: primaryBranch.address || null,
          },
          owner,
          productCode,
          planCode,
          subscriptionMode,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        onboarding?: { organizationId?: string };
      };
      if (!res.ok) {
        setError(data.message ?? "สร้างองค์กรไม่สำเร็จ");
        return;
      }
      const orgId = data.onboarding?.organizationId;
      router.push(orgId ? `/organizations/${orgId}` : "/organizations");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-2 text-[length:var(--text-caption)]">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-full border px-3 py-1 ${
              index === step
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="card grid gap-3">
          {(
            [
              ["customerCode", "รหัสลูกค้า"],
              ["slug", "Slug"],
              ["displayName", "ชื่อที่แสดง"],
              ["legalName", "ชื่อทางกฎหมาย"],
              ["taxId", "เลขผู้เสียภาษี"],
              ["email", "อีเมลองค์กร"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-[length:var(--text-label)]">
              {label}
              <input
                className="input"
                value={organization[key]}
                onChange={(e) =>
                  setOrganization((prev) => ({ ...prev, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="card grid gap-3">
          <label className="grid gap-1 text-[length:var(--text-label)]">
            รหัสสาขาหลัก
            <input
              className="input"
              value={primaryBranch.code}
              onChange={(e) =>
                setPrimaryBranch((p) => ({ ...p, code: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-[length:var(--text-label)]">
            ชื่อสาขาหลัก
            <input
              className="input"
              value={primaryBranch.name}
              onChange={(e) =>
                setPrimaryBranch((p) => ({ ...p, name: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-[length:var(--text-label)]">
            ที่อยู่
            <textarea
              className="textarea"
              value={primaryBranch.address}
              onChange={(e) =>
                setPrimaryBranch((p) => ({ ...p, address: e.target.value }))
              }
            />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card grid gap-3">
          <label className="grid gap-1 text-[length:var(--text-label)]">
            อีเมลเจ้าของ
            <input
              className="input"
              type="email"
              value={owner.email}
              onChange={(e) => setOwner((o) => ({ ...o, email: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[length:var(--text-label)]">
            ชื่อเจ้าของ
            <input
              className="input"
              value={owner.displayName}
              onChange={(e) =>
                setOwner((o) => ({ ...o, displayName: e.target.value }))
              }
            />
          </label>
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
            หากยังไม่มี Auth user ระบบจะสร้างคำเชิญ OWNER (ไม่ส่ง invite จริงในโหมด mock)
          </p>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card grid gap-3">
          <label className="grid gap-1 text-[length:var(--text-label)]">
            ผลิตภัณฑ์
            <select
              className="select"
              value={productCode}
              onChange={(e) => {
                setProductCode(e.target.value);
                setPlanCode("");
              }}
            >
              {props.products.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="card grid gap-3">
          <label className="grid gap-1 text-[length:var(--text-label)]">
            แพ็กเกจ
            <select
              className="select"
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
            >
              <option value="">เลือกแพ็กเกจ</option>
              {plansForProduct.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code}) — ราคาตัวอย่าง
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[length:var(--text-label)]">
            โหมดการสมัคร
            <select
              className="select"
              value={subscriptionMode}
              onChange={(e) =>
                setSubscriptionMode(e.target.value as "TRIAL" | "ACTIVE")
              }
            >
              <option value="TRIAL">ทดลองใช้</option>
              <option value="ACTIVE">เปิดใช้งาน</option>
            </select>
          </label>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="card grid gap-2 text-[length:var(--text-helper)]">
          <p>
            <strong>องค์กร:</strong> {organization.displayName} ({organization.customerCode})
          </p>
          <p>
            <strong>สาขาหลัก:</strong> {primaryBranch.name} ({primaryBranch.code})
          </p>
          <p>
            <strong>เจ้าของ:</strong> {owner.displayName} · {owner.email}
          </p>
          <p>
            <strong>ผลิตภัณฑ์/แพ็กเกจ:</strong> {productCode} / {planCode} ·{" "}
            {subscriptionMode}
          </p>
          <p className="text-[var(--text-muted)]">
            SUPER_ADMIN ไม่ต้องเป็นสมาชิกองค์กรใหม่ — สลับเข้าโหมดผู้ดูแลแพลตฟอร์มได้หลังสร้าง
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={back} disabled={pending}>
            ย้อนกลับ
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn" onClick={next} disabled={pending}>
            ถัดไป
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={submit}
            disabled={pending || !planCode}
          >
            {pending ? "กำลังสร้าง..." : "ยืนยันและสร้างองค์กร"}
          </button>
        )}
      </div>
    </div>
  );
}

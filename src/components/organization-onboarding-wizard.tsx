"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileText,
  IdCard,
  Mail,
  MapPin,
  Package,
  Phone,
  Store,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import {
  EMPTY_STAFF_IDENTITY,
  StaffIdentityFields,
  type StaffIdentityFormValues,
} from "@/components/staff-identity-fields";
import { FormField, SectionHeader } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  composeStaffDisplayName,
  individualCustomerIdentitySchema,
} from "@/lib/platform/staff-identity";
import { cn } from "@/lib/utils";

type ProductOption = { code: string; name: string };
type PlanOption = { code: string; name: string; productCode: string };
type ContactRole = "OWNER" | "ADMIN";
type EntityType =
  (typeof MASTER.organizationEntityType)[keyof typeof MASTER.organizationEntityType];

function StepIcon(props: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full border",
        props.active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--text-muted)]",
      )}
      aria-hidden="true"
    >
      {props.children}
    </span>
  );
}

function FieldIcon(props: { children: ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
      aria-hidden="true"
    >
      {props.children}
    </span>
  );
}

export function OrganizationOnboardingWizard(props: {
  products: ProductOption[];
  plans: PlanOption[];
  /** SUPER_ADMIN creates OWNER; sales creates ADMIN for the customer. */
  contactRole?: ContactRole;
}) {
  const contactRole: ContactRole = props.contactRole ?? "OWNER";
  const contactLabel =
    contactRole === "ADMIN" ? "ผู้ดูแลองค์กร (ADMIN)" : "เจ้าขององค์กร (OWNER)";
  const STEPS = [
    TH.org.stepOrg,
    TH.org.stepBranch,
    contactLabel,
    TH.org.stepProductPlan,
    TH.org.stepConfirm,
  ] as const;

  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `onboard-${crypto.randomUUID()}`);

  const [entityType, setEntityType] = useState<EntityType>(
    MASTER.organizationEntityType.LEGAL_ENTITY,
  );
  const [organization, setOrganization] = useState({
    displayName: "",
    legalName: "",
    nameEn: "",
    taxId: "",
    email: "",
    phone: "",
    address: "",
  });
  const [person, setPerson] = useState<StaffIdentityFormValues>({
    ...EMPTY_STAFF_IDENTITY,
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
  const [selectedProductCodes, setSelectedProductCodes] = useState<string[]>(
    () => (props.products[0] ? [props.products[0].code] : []),
  );
  const [planByProduct, setPlanByProduct] = useState<Record<string, string>>(
    {},
  );
  const [subscriptionMode, setSubscriptionMode] = useState<"TRIAL" | "ACTIVE">(
    "TRIAL",
  );

  const isIndividual =
    entityType === MASTER.organizationEntityType.INDIVIDUAL;
  const individualDisplayName = useMemo(
    () =>
      person.firstNameTh.trim() && person.lastNameTh.trim()
        ? composeStaffDisplayName(person)
        : "",
    [person],
  );

  const productSelections = useMemo(
    () =>
      selectedProductCodes.map((productCode) => ({
        productCode,
        planCode: planByProduct[productCode] ?? "",
        productName:
          props.products.find((p) => p.code === productCode)?.name ?? productCode,
        plans: props.plans.filter((p) => p.productCode === productCode),
      })),
    [selectedProductCodes, planByProduct, props.products, props.plans],
  );

  const selectionsReady =
    productSelections.length > 0 &&
    productSelections.every((row) => row.planCode.length > 0);

  function toggleProduct(code: string) {
    setSelectedProductCodes((prev) => {
      if (prev.includes(code)) {
        setPlanByProduct((plans) => {
          const next = { ...plans };
          delete next[code];
          return next;
        });
        return prev.filter((item) => item !== code);
      }
      return [...prev, code];
    });
    setError(null);
  }

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (isIndividual) {
        // TEMP: tax-payer block may be left empty for testing.
        const hasPersonInput =
          person.firstNameTh.trim().length > 0 ||
          person.lastNameTh.trim().length > 0 ||
          person.nationalId.trim().length > 0 ||
          person.dateOfBirth.trim().length > 0 ||
          person.addressLine.trim().length > 0 ||
          person.phone.trim().length > 0;
        if (hasPersonInput) {
          const parsed = individualCustomerIdentitySchema.safeParse(person);
          if (!parsed.success) {
            return (
              parsed.error.issues[0]?.message ?? TH.org.needPersonIdentity
            );
          }
        }
      } else if (organization.displayName.trim().length < 2) {
        return TH.org.needDisplayName;
      }
    }
    if (current === 1) {
      if (!primaryBranch.code.trim() || !primaryBranch.name.trim()) {
        return "กรุณากรอกรหัสและชื่อสาขาหลัก";
      }
    }
    if (current === 2) {
      if (!owner.email.trim() || !owner.displayName.trim()) {
        return "กรุณากรอกอีเมลและชื่อผู้ติดต่อ";
      }
    }
    if (current === 3) {
      if (selectedProductCodes.length === 0) {
        return TH.org.needProductSelection;
      }
      if (!selectionsReady) {
        return TH.org.needPlanForProduct;
      }
    }
    return null;
  }

  function next() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
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
      const hasPersonInput =
        person.firstNameTh.trim().length > 0 ||
        person.lastNameTh.trim().length > 0 ||
        person.nationalId.trim().length > 0 ||
        person.dateOfBirth.trim().length > 0 ||
        person.addressLine.trim().length > 0 ||
        person.phone.trim().length > 0;
      const organizationPayload = isIndividual
        ? {
            entityType,
            email: organization.email.trim() || null,
            // TEMP: omit empty tax-payer identity for testing.
            person: hasPersonInput ? person : null,
          }
        : {
            entityType,
            displayName: organization.displayName.trim(),
            legalName: organization.legalName.trim() || null,
            nameEn: organization.nameEn.trim() || null,
            taxId: organization.taxId.trim() || null,
            email: organization.email.trim() || null,
            phone: organization.phone.trim() || null,
            address: organization.address.trim() || null,
          };

      const res = await fetch("/api/platform/organizations/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          organization: organizationPayload,
          primaryBranch: {
            ...primaryBranch,
            address: primaryBranch.address || null,
          },
          owner,
          selections: productSelections.map((row) => ({
            productCode: row.productCode,
            planCode: row.planCode,
          })),
          subscriptionMode,
        }),
      });
      const raw = await res.text();
      let data: {
        message?: string;
        onboarding?: { organizationId?: string };
      } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          setError(
            res.ok
              ? "สร้างสำเร็จแต่ตอบกลับผิดรูปแบบ"
              : "สร้างองค์กรไม่สำเร็จ กรุณาลองใหม่",
          );
          return;
        }
      }
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
    <div className="grid gap-5">
      <ol className="flex flex-wrap gap-2 text-[length:var(--text-caption)]">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
              index === step
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : index < step
                  ? "border-[var(--border)] text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
            )}
          >
            <StepIcon active={index === step}>
              {index < step ? (
                <Check className="size-3.5" />
              ) : (
                <span className="text-[10px] font-semibold">{index + 1}</span>
              )}
            </StepIcon>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="card space-y-6 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Building2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                {TH.org.stepOrg}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                {TH.org.entityTypeHint}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title={TH.org.entityType} />
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setEntityType(MASTER.organizationEntityType.LEGAL_ENTITY)
                }
                className={cn(
                  "flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors",
                  !isIndividual
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                    : "border-[var(--border)] hover:border-[var(--primary)]/50",
                )}
              >
                <Building2
                  className="mt-0.5 size-5 shrink-0 text-[var(--primary)]"
                  aria-hidden="true"
                />
                <span>
                  <span className="block font-medium text-[var(--foreground)]">
                    {TH.org.entityLegal}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                    {TH.org.entityLegalHint}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setEntityType(MASTER.organizationEntityType.INDIVIDUAL)
                }
                className={cn(
                  "flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors",
                  isIndividual
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                    : "border-[var(--border)] hover:border-[var(--primary)]/50",
                )}
              >
                <UserRound
                  className="mt-0.5 size-5 shrink-0 text-[var(--primary)]"
                  aria-hidden="true"
                />
                <span>
                  <span className="block font-medium text-[var(--foreground)]">
                    {TH.org.entityIndividual}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                    {TH.org.entityIndividualHint}
                  </span>
                </span>
              </button>
            </div>
          </div>

          {isIndividual ? (
            <div className="space-y-4 border-t border-[var(--border)] pt-5">
              <SectionHeader
                title={TH.org.personSection}
                description={TH.org.personSectionHint}
                badge={
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">
                    ใบกำกับภาษี
                  </span>
                }
              />
              <StaffIdentityFields
                idPrefix="org-"
                requireNationalId={false}
                nationalIdHint={TH.org.nationalIdInvoiceHint}
                values={person}
                onChange={(patch) =>
                  setPerson((current) => ({ ...current, ...patch }))
                }
              />
              <FormField
                label={TH.org.email}
                htmlFor="orgEmailIndividual"
                hint={TH.org.emailHint}
              >
                <div className="relative max-w-md">
                  <FieldIcon>
                    <Mail className="size-4" />
                  </FieldIcon>
                  <Input
                    id="orgEmailIndividual"
                    className="pl-10"
                    type="email"
                    placeholder="contact@example.com"
                    value={organization.email}
                    onChange={(e) =>
                      setOrganization((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>
              </FormField>
              {individualDisplayName ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  ชื่อบนใบกำกับภาษี:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {individualDisplayName}
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-4 border-t border-[var(--border)] pt-5">
                <FormField
                  label={TH.org.displayName}
                  htmlFor="displayName"
                  required
                  hint={TH.org.displayNameHint}
                >
                  <div className="relative">
                    <FieldIcon>
                      <Building2 className="size-4" />
                    </FieldIcon>
                    <Input
                      id="displayName"
                      className="pl-10"
                      placeholder="เช่น บริษัท ตัวอย่าง จำกัด"
                      value={organization.displayName}
                      onChange={(e) =>
                        setOrganization((prev) => ({
                          ...prev,
                          displayName: e.target.value,
                        }))
                      }
                    />
                  </div>
                </FormField>
              </div>

              <div className="space-y-4 border-t border-[var(--border)] pt-5">
                <SectionHeader
                  title={TH.org.detailSection}
                  description={TH.org.detailSectionHint}
                  badge={
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                      ไม่บังคับ
                    </span>
                  }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label={TH.org.legalName}
                    htmlFor="legalName"
                    hint={TH.org.legalNameHint}
                  >
                    <div className="relative">
                      <FieldIcon>
                        <FileText className="size-4" />
                      </FieldIcon>
                      <Input
                        id="legalName"
                        className="pl-10"
                        placeholder="ชื่อตามหนังสือรับรอง"
                        value={organization.legalName}
                        onChange={(e) =>
                          setOrganization((prev) => ({
                            ...prev,
                            legalName: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </FormField>
                  <FormField
                    label={TH.org.nameEn}
                    htmlFor="nameEn"
                    hint={TH.org.nameEnHint}
                  >
                    <Input
                      id="nameEn"
                      placeholder="Example Co., Ltd."
                      value={organization.nameEn}
                      onChange={(e) =>
                        setOrganization((prev) => ({
                          ...prev,
                          nameEn: e.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <FormField
                    label={TH.org.taxId}
                    htmlFor="taxId"
                    hint={TH.org.taxIdHint}
                  >
                    <div className="relative">
                      <FieldIcon>
                        <IdCard className="size-4" />
                      </FieldIcon>
                      <Input
                        id="taxId"
                        className="pl-10"
                        inputMode="numeric"
                        placeholder="0-0000-00000-00-0"
                        value={organization.taxId}
                        onChange={(e) =>
                          setOrganization((prev) => ({
                            ...prev,
                            taxId: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </FormField>
                  <FormField
                    label={TH.org.phone}
                    htmlFor="orgPhone"
                    hint={TH.org.phoneHint}
                  >
                    <div className="relative">
                      <FieldIcon>
                        <Phone className="size-4" />
                      </FieldIcon>
                      <Input
                        id="orgPhone"
                        className="pl-10"
                        type="tel"
                        inputMode="tel"
                        placeholder="02-000-0000 หรือ 08X-XXX-XXXX"
                        value={organization.phone}
                        onChange={(e) =>
                          setOrganization((prev) => ({
                            ...prev,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </FormField>
                  <FormField
                    label={TH.org.email}
                    htmlFor="orgEmail"
                    hint={TH.org.emailHint}
                  >
                    <div className="relative">
                      <FieldIcon>
                        <Mail className="size-4" />
                      </FieldIcon>
                      <Input
                        id="orgEmail"
                        className="pl-10"
                        type="email"
                        placeholder="contact@example.com"
                        value={organization.email}
                        onChange={(e) =>
                          setOrganization((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </FormField>
                </div>
                <FormField
                  label={TH.org.address}
                  htmlFor="orgAddress"
                  hint={TH.org.addressHint}
                >
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-3 size-4 text-[var(--muted-foreground)]"
                      aria-hidden="true"
                    />
                    <textarea
                      id="orgAddress"
                      className="textarea min-h-24 pl-12"
                      placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                      value={organization.address}
                      onChange={(e) =>
                        setOrganization((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                    />
                  </div>
                </FormField>
              </div>
            </>
          )}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Store className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{TH.org.stepBranch}</h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                สาขาแรกขององค์กร — ใช้เป็นสาขาหลักในการเริ่มต้นใช้งาน
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="รหัสสาขาหลัก"
              htmlFor="branchCode"
              required
              hint="รหัสสั้นสำหรับอ้างอิงในระบบ เช่น HQ"
            >
              <Input
                id="branchCode"
                value={primaryBranch.code}
                onChange={(e) =>
                  setPrimaryBranch((p) => ({ ...p, code: e.target.value }))
                }
              />
            </FormField>
            <FormField
              label="ชื่อสาขาหลัก"
              htmlFor="branchName"
              required
              hint="ชื่อที่แสดงในสวิตช์สาขาและรายงาน"
            >
              <Input
                id="branchName"
                value={primaryBranch.name}
                onChange={(e) =>
                  setPrimaryBranch((p) => ({ ...p, name: e.target.value }))
                }
              />
            </FormField>
          </div>
          <FormField
            label="ที่อยู่สาขา"
            htmlFor="branchAddress"
            hint="ไม่บังคับ — ที่ตั้งของสาขาหลัก"
          >
            <textarea
              id="branchAddress"
              className="textarea min-h-24"
              value={primaryBranch.address}
              onChange={(e) =>
                setPrimaryBranch((p) => ({ ...p, address: e.target.value }))
              }
            />
          </FormField>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <UserRound className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{contactLabel}</h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                {contactRole === "ADMIN"
                  ? TH.org.ownerStepHintAdmin
                  : TH.org.ownerStepHintOwner}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={`อีเมล${contactRole === "ADMIN" ? "ผู้ดูแล" : "เจ้าของ"}`}
              htmlFor="ownerEmail"
              required
              hint={TH.org.ownerEmailHint}
            >
              <div className="relative">
                <FieldIcon>
                  <Mail className="size-4" />
                </FieldIcon>
                <Input
                  id="ownerEmail"
                  className="pl-10"
                  type="email"
                  value={owner.email}
                  onChange={(e) =>
                    setOwner((o) => ({ ...o, email: e.target.value }))
                  }
                />
              </div>
            </FormField>
            <FormField
              label={`ชื่อ${contactRole === "ADMIN" ? "ผู้ดูแล" : "เจ้าของ"}`}
              htmlFor="ownerName"
              required
              hint="ชื่อที่แสดงในรายชื่อสมาชิกองค์กร"
            >
              <Input
                id="ownerName"
                value={owner.displayName}
                onChange={(e) =>
                  setOwner((o) => ({ ...o, displayName: e.target.value }))
                }
              />
            </FormField>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Package className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {TH.org.stepProductPlan}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                {TH.org.stepProductPlanHint}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {props.products.map((product) => {
              const selected = selectedProductCodes.includes(product.code);
              const plans = props.plans.filter(
                (plan) => plan.productCode === product.code,
              );
              return (
                <div
                  key={product.code}
                  className={cn(
                    "rounded-[var(--radius-lg)] border p-4 transition-colors",
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/40"
                      : "border-[var(--border)]",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={selected}
                      onChange={() => toggleProduct(product.code)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--foreground)]">
                        {product.name}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {product.code}
                      </span>
                    </span>
                  </label>
                  {selected ? (
                    <div className="mt-3 pl-7">
                      <FormField
                        label={`${TH.org.stepPlan} — ${product.name}`}
                        htmlFor={`plan-${product.code}`}
                        required
                        hint={
                          plans.length === 0
                            ? "ยังไม่มีแพ็กเกจที่เผยแพร่สำหรับผลิตภัณฑ์นี้"
                            : "เลือกแพ็กเกจที่ใช้เริ่มต้นกับผลิตภัณฑ์นี้"
                        }
                      >
                        <select
                          id={`plan-${product.code}`}
                          className="select"
                          value={planByProduct[product.code] ?? ""}
                          onChange={(e) =>
                            setPlanByProduct((prev) => ({
                              ...prev,
                              [product.code]: e.target.value,
                            }))
                          }
                        >
                          <option value="">เลือกแพ็กเกจ</option>
                          {plans.map((plan) => (
                            <option key={plan.code} value={plan.code}>
                              {plan.name} ({plan.code})
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <FormField
            label="โหมดการสมัคร"
            htmlFor="subscriptionMode"
            hint="ใช้โหมดเดียวกันกับทุกผลิตภัณฑ์ที่เลือก — ทดลองใช้เหมาะกับการเริ่มต้น"
          >
            <select
              id="subscriptionMode"
              className="select max-w-md"
              value={subscriptionMode}
              onChange={(e) =>
                setSubscriptionMode(e.target.value as "TRIAL" | "ACTIVE")
              }
            >
              <option value="TRIAL">ทดลองใช้ (TRIAL)</option>
              <option value="ACTIVE">เปิดใช้งาน (ACTIVE)</option>
            </select>
          </FormField>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--primary-soft)] text-[var(--primary)]">
              <Check className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{TH.org.stepConfirm}</h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                ตรวจสอบสรุปก่อนสร้างองค์กรในระบบ
              </p>
            </div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/40 p-3">
              <dt className="text-[var(--muted-foreground)]">องค์กร</dt>
              <dd className="mt-1 text-xs text-[var(--muted-foreground)]">
                {isIndividual ? TH.org.entityIndividual : TH.org.entityLegal}
              </dd>
              <dd className="mt-1 font-medium">
                {isIndividual
                  ? individualDisplayName || "—"
                  : organization.displayName}
              </dd>
              <dd className="mt-1 text-xs text-[var(--muted-foreground)]">
                ระบบจะสร้างรหัสลูกค้าให้อัตโนมัติเมื่อบันทึก
              </dd>
              {!isIndividual && organization.legalName ? (
                <dd className="mt-1 text-[var(--muted-foreground)]">
                  ชื่อทางกฎหมาย: {organization.legalName}
                </dd>
              ) : null}
              {isIndividual && person.nationalId ? (
                <dd className="mt-1 text-[var(--muted-foreground)]">
                  เลขบัตรประชาชน: {person.nationalId}
                </dd>
              ) : null}
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/40 p-3">
              <dt className="text-[var(--muted-foreground)]">สาขาหลัก</dt>
              <dd className="mt-1 font-medium">
                {primaryBranch.name} ({primaryBranch.code})
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/40 p-3">
              <dt className="text-[var(--muted-foreground)]">
                {contactRole === "ADMIN" ? "ผู้ดูแล" : "เจ้าของ"}
              </dt>
              <dd className="mt-1 font-medium">
                {owner.displayName} · {owner.email}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/40 p-3 sm:col-span-2">
              <dt className="text-[var(--muted-foreground)]">
                ผลิตภัณฑ์ / แพ็กเกจ · {subscriptionMode}
              </dt>
              <dd className="mt-2 grid gap-1.5">
                {productSelections.map((row) => (
                  <div key={row.productCode} className="font-medium">
                    {row.productName} ({row.productCode}) → {row.planCode || "—"}
                  </div>
                ))}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-[var(--muted-foreground)]">
            {TH.org.ownerFirstLoginHint}
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {contactRole === "ADMIN"
              ? "องค์กรนี้จะปรากฏในพอร์ตโฟลิโอของคุณ พนักงานขายคนอื่นจะมองไม่เห็น"
              : "SUPER_ADMIN ไม่ต้องเป็นสมาชิกองค์กรใหม่ — สลับเข้าโหมดผู้ดูแลแพลตฟอร์มได้หลังสร้าง"}
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {step > 0 ? (
          <IconTextButton
            type="button"
            variant="outline"
            onClick={back}
            disabled={pending}
            icon={<ArrowLeft aria-hidden="true" />}
            label={TH.org.back}
          />
        ) : null}
        {step < STEPS.length - 1 ? (
          <IconTextButton
            type="button"
            onClick={next}
            disabled={pending}
            icon={<ArrowRight aria-hidden="true" />}
            label={TH.org.next}
          />
        ) : (
          <IconTextButton
            type="button"
            onClick={submit}
            disabled={pending || !selectionsReady}
            icon={
              <Check
                className={pending ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={pending ? TH.org.creating : TH.org.confirmCreate}
          />
        )}
      </div>
    </div>
  );
}

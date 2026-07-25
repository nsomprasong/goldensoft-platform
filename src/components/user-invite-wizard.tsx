"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FormField, StatusBadge } from "@/components/ui/admin-ui";
import { pushToast } from "@/components/ui/toast";
import { TH, labelRole } from "@/lib/i18n/th";

type OrgOption = { id: string; name: string };
type BranchOption = { id: string; name: string; code: string };

const STEPS = [
  TH.users.stepAccount,
  TH.users.stepOrganization,
  TH.users.stepRole,
  TH.users.stepBranchScope,
  TH.users.stepConfirm,
] as const;

export function UserInviteWizard(props: {
  organizations: OrgOption[];
  branchesByOrg: Record<string, BranchOption[]>;
  showTestModeBadge?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationId, setOrganizationId] = useState(
    props.organizations[0]?.id ?? "",
  );
  const [organizationRole, setOrganizationRole] = useState<
    "OWNER" | "ADMIN" | "BILLING_CONTACT"
  >("ADMIN");
  const [branchScope, setBranchScope] = useState<
    "ALL_BRANCHES" | "SELECTED" | "NONE"
  >("ALL_BRANCHES");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const idempotencyKey = useRef(crypto.randomUUID());

  const branches = useMemo(
    () => props.branchesByOrg[organizationId] ?? [],
    [props.branchesByOrg, organizationId],
  );

  async function submit() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/platform/users/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey.current,
      },
      body: JSON.stringify({
        email,
        displayName,
        organizationId,
        organizationRoleCode: organizationRole,
        branchScope,
        branchIds: branchScope === "SELECTED" ? branchIds : [],
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(data.message ?? TH.users.inviteSuccess);
    router.push("/users");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {props.showTestModeBadge ? (
        <div className="flex items-center gap-2">
          <StatusBadge label={TH.common.testMode} tone="warning" />
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            คำเชิญจะไม่ถูกส่งจริงในโหมดนี้
          </span>
        </div>
      ) : null}

      <ol
        className="flex flex-wrap gap-2"
        aria-label="ขั้นตอนการเชิญผู้ใช้งาน"
      >
        {STEPS.map((label, index) => {
          const n = index + 1;
          const current = n === step;
          const done = n < step;
          return (
            <li
              key={label}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-[length:var(--text-caption)] ${
                current
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : done
                    ? "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"
                    : "border-[var(--border)] text-[var(--text-muted)]"
              }`}
              aria-current={current ? "step" : undefined}
            >
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[length:var(--text-caption)] font-semibold ${
                  current
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--surface)] text-[var(--text-secondary)]"
                }`}
              >
                {n}
              </span>
              <span className="truncate font-medium">{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={TH.users.email} htmlFor="email" required>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              autoComplete="email"
            />
          </FormField>
          <FormField label={TH.users.displayName} htmlFor="displayName" required>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              autoComplete="name"
            />
          </FormField>
        </div>
      ) : null}

      {step === 2 ? (
        <FormField label={TH.nav.organizations} htmlFor="organizationId" required>
          <select
            id="organizationId"
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
              setBranchIds([]);
            }}
            className="select"
          >
            {props.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      {step === 3 ? (
        <FormField label={TH.users.stepRole} htmlFor="role" required>
          <select
            id="role"
            value={organizationRole}
            onChange={(e) =>
              setOrganizationRole(
                e.target.value as "OWNER" | "ADMIN" | "BILLING_CONTACT",
              )
            }
            className="select"
          >
            {(["OWNER", "ADMIN", "BILLING_CONTACT"] as const).map((r) => (
              <option key={r} value={r}>
                {labelRole(r)}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3">
          <FormField label={TH.users.stepBranchScope} htmlFor="scope" required>
            <select
              id="scope"
              value={branchScope}
              onChange={(e) =>
                setBranchScope(
                  e.target.value as "ALL_BRANCHES" | "SELECTED" | "NONE",
                )
              }
              className="select"
            >
              <option value="ALL_BRANCHES">{TH.users.scopeAll}</option>
              <option value="SELECTED">{TH.users.scopeSelected}</option>
              <option value="NONE">{TH.users.scopeNone}</option>
            </select>
          </FormField>
          {branchScope === "SELECTED" ? (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
              {branches.length === 0 ? (
                <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
                  ยังไม่มีสาขาในองค์กรนี้
                </p>
              ) : (
                branches.map((b) => (
                  <label
                    key={b.id}
                    className="flex min-h-11 items-center gap-2 text-[length:var(--text-label)]"
                  >
                    <input
                      type="checkbox"
                      checked={branchIds.includes(b.id)}
                      onChange={(e) => {
                        setBranchIds((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id),
                        );
                      }}
                    />
                    {b.name} ({b.code})
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <dl className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4 text-[length:var(--text-label)] sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">{TH.users.email}</dt>
            <dd className="font-medium">{email}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{TH.users.displayName}</dt>
            <dd className="font-medium">{displayName}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{TH.nav.organizations}</dt>
            <dd className="font-medium">
              {props.organizations.find((o) => o.id === organizationId)?.name}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">บทบาท</dt>
            <dd className="font-medium">{labelRole(organizationRole)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--text-muted)]">ขอบเขตสาขา</dt>
            <dd className="font-medium">
              {branchScope === "ALL_BRANCHES"
                ? TH.users.scopeAll
                : branchScope === "NONE"
                  ? TH.users.scopeNone
                  : `${TH.users.scopeSelected} (${branchIds.length})`}
            </dd>
          </div>
        </dl>
      ) : null}

      {error ? (
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-between">
        {step > 1 ? (
          <button
            type="button"
            className="btn btn-secondary btn-block-mobile"
            onClick={() => setStep((s) => s - 1)}
          >
            {TH.common.back}
          </button>
        ) : (
          <span />
        )}
        {step < 5 ? (
          <button
            type="button"
            className="btn btn-block-mobile"
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 1 && (!email || !displayName)) ||
              (step === 2 && !organizationId) ||
              (step === 4 && branchScope === "SELECTED" && branchIds.length === 0)
            }
          >
            {TH.common.continue}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-block-mobile"
            disabled={pending}
            onClick={submit}
          >
            {pending ? TH.common.loading : TH.users.invite}
          </button>
        )}
      </div>
    </div>
  );
}

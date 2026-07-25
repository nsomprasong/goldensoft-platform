"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FormField } from "@/components/ui/admin-ui";
import { pushToast } from "@/components/ui/toast";
import { TH, labelRole } from "@/lib/i18n/th";

type OrgOption = { id: string; name: string };
type BranchOption = { id: string; name: string; code: string };

export function UserInviteWizard(props: {
  organizations: OrgOption[];
  branchesByOrg: Record<string, BranchOption[]>;
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
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        ขั้นตอน {step} / 5 —{" "}
        {step === 1
          ? TH.users.stepAccount
          : step === 2
            ? TH.users.stepOrganization
            : step === 3
              ? TH.users.stepRole
              : step === 4
                ? TH.users.stepBranchScope
                : TH.users.stepConfirm}
      </p>

      {step === 1 ? (
        <div className="space-y-3">
          <FormField label={TH.users.email} htmlFor="email" required>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </FormField>
          <FormField label={TH.users.displayName} htmlFor="displayName" required>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
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
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
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
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
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
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <option value="ALL_BRANCHES">{TH.users.scopeAll}</option>
              <option value="SELECTED">{TH.users.scopeSelected}</option>
              <option value="NONE">{TH.users.scopeNone}</option>
            </select>
          </FormField>
          {branchScope === "SELECTED" ? (
            <div className="space-y-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
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
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <ul className="space-y-1 text-sm">
          <li>
            {TH.users.email}: <strong>{email}</strong>
          </li>
          <li>
            {TH.users.displayName}: <strong>{displayName}</strong>
          </li>
          <li>
            {TH.nav.organizations}:{" "}
            <strong>
              {props.organizations.find((o) => o.id === organizationId)?.name}
            </strong>
          </li>
          <li>
            บทบาท: <strong>{labelRole(organizationRole)}</strong>
          </li>
          <li>
            ขอบเขตสาขา:{" "}
            <strong>
              {branchScope === "ALL_BRANCHES"
                ? TH.users.scopeAll
                : branchScope === "NONE"
                  ? TH.users.scopeNone
                  : `${TH.users.scopeSelected} (${branchIds.length})`}
            </strong>
          </li>
        </ul>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        {step > 1 ? (
          <button
            type="button"
            className="btn !bg-slate-600"
            onClick={() => setStep((s) => s - 1)}
          >
            {TH.common.back}
          </button>
        ) : null}
        {step < 5 ? (
          <button
            type="button"
            className="btn"
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 1 && (!email || !displayName)) ||
              (step === 2 && !organizationId)
            }
          >
            {TH.common.continue}
          </button>
        ) : (
          <button type="button" className="btn" disabled={pending} onClick={submit}>
            {pending ? TH.common.loading : TH.users.invite}
          </button>
        )}
      </div>
    </div>
  );
}

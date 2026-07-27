"use client";

import { KeyRound, Plus, Undo2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField, SectionHeader, StatusBadge } from "@/components/ui/admin-ui";
import { Input } from "@/components/ui/input";
import {
  IconTextButton,
  labeledActionSoftClassName,
} from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { labelRole, labelStatus, TH } from "@/lib/i18n/th";

export type OrganizationAdminRow = {
  userProfileId: string;
  email: string;
  displayName: string;
  phone: string | null;
  roleCodes: string[];
  statusCode: string;
  openPasswordReset: { id: string; expiresAt: string | Date } | null;
};

export function OrganizationAdminsPanel(props: {
  organizationId: string;
  admins: OrganizationAdminRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !displayName.trim()) return;
    setAdding(true);
    const res = await fetch(
      `/api/platform/organizations/${props.organizationId}/admins`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          roleCode: "ADMIN",
        }),
      },
    );
    const data = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    setAdding(false);
    pushToast(data?.message ?? (res.ok ? TH.common.saved : TH.common.failed));
    if (res.ok) {
      setEmail("");
      setDisplayName("");
      router.refresh();
    }
  }

  async function togglePasswordReset(admin: OrganizationAdminRow) {
    const cancelling = admin.openPasswordReset !== null;
    if (!cancelling && !window.confirm(TH.org.adminPasswordResetConfirm)) {
      return;
    }
    setBusyId(admin.userProfileId);
    const res = await fetch(
      `/api/platform/organizations/${props.organizationId}/admins/${admin.userProfileId}/password-reset`,
      cancelling
        ? {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resetId: admin.openPasswordReset!.id }),
          }
        : { method: "POST" },
    );
    const data = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    setBusyId(null);
    pushToast(data?.message ?? (res.ok ? TH.common.saved : TH.common.failed));
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <section className="card space-y-4">
      <SectionHeader
        title={TH.org.adminsSection}
        description={TH.org.adminsSectionHint}
      />

      {props.admins.length === 0 ? (
        <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
          {TH.org.adminEmpty}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {props.admins.map((admin) => {
            const pending = busyId === admin.userProfileId;
            const cancelling = admin.openPasswordReset !== null;
            return (
              <li
                key={admin.userProfileId}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{admin.displayName}</span>
                    {admin.roleCodes.map((code) => (
                      <StatusBadge
                        key={code}
                        label={labelRole(code)}
                        code={code}
                      />
                    ))}
                    <StatusBadge
                      label={labelStatus(admin.statusCode)}
                      code={admin.statusCode}
                    />
                  </div>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {admin.email}
                    {admin.phone ? ` · ${admin.phone}` : ""}
                  </p>
                  {admin.openPasswordReset ? (
                    <p className="text-xs text-[var(--warning)]">
                      {TH.org.adminPasswordResetPending} ·{" "}
                      {new Date(
                        admin.openPasswordReset.expiresAt,
                      ).toLocaleString("th-TH")}
                    </p>
                  ) : null}
                </div>
                {props.canManage ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <IconTextButton
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void togglePasswordReset(admin)}
                      className={
                        cancelling
                          ? "border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] hover:border-[var(--danger)]/40 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          : labeledActionSoftClassName
                      }
                      icon={
                        cancelling ? (
                          <Undo2
                            className={pending ? "animate-pulse" : undefined}
                            aria-hidden="true"
                          />
                        ) : (
                          <KeyRound
                            className={pending ? "animate-pulse" : undefined}
                            aria-hidden="true"
                          />
                        )
                      }
                      label={
                        pending
                          ? TH.common.loading
                          : cancelling
                            ? TH.org.adminPasswordResetCancel
                            : TH.org.adminPasswordReset
                      }
                    />
                    <Link
                      href={`/users/profiles/${admin.userProfileId}`}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--muted)]"
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      {TH.org.adminViewProfile}
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {props.canManage ? (
        <form
          onSubmit={(event) => void addAdmin(event)}
          className="grid gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <FormField
            label={TH.org.adminEmail}
            htmlFor="org-admin-email"
            required
          >
            <Input
              id="org-admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField
            label={TH.org.adminName}
            htmlFor="org-admin-name"
            required
          >
            <Input
              id="org-admin-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <IconTextButton
            type="submit"
            disabled={adding || !email.trim() || !displayName.trim()}
            icon={
              <Plus
                className={adding ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={adding ? TH.common.loading : TH.org.adminAdd}
          />
        </form>
      ) : null}
    </section>
  );
}

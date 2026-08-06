"use client";

import { Building2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { signalNavigationDone, signalNavigationPending } from "@/lib/navigation-pending";

export function CustomerRoleOrganizationPicker(props: {
  organizations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openOrganization(organizationId: string) {
    setError(null);
    signalNavigationPending();
    start(async () => {
      const response = await fetch("/api/platform/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, branchId: null, branchSelected: true, mode: "managed_org" }),
      });
      if (!response.ok) {
        setError("ไม่สามารถเปิดบริบทขององค์กรนี้ได้");
        signalNavigationDone();
        return;
      }
      router.push(`/roles?context=organization&organizationId=${organizationId}`);
      router.refresh();
    });
  }

  if (props.organizations.length === 0) {
    return <section className="card text-center text-[var(--text-muted)]">ยังไม่มีองค์กรลูกค้าที่คุณรับผิดชอบ</section>;
  }

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="องค์กรลูกค้าที่จัดการบทบาทได้">
      {props.organizations.map((organization) => (
        <button
          key={organization.id}
          type="button"
          className="card flex min-w-0 items-center gap-3 text-left transition hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          disabled={pending}
          onClick={() => openOrganization(organization.id)}
        >
          <span className="nav-icon-idle-organization inline-flex size-11 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
            <Building2 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{organization.name}</span>
            <span className="mt-1 flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <ShieldCheck className="size-4" aria-hidden="true" /> จัดการบทบาทและสิทธิ์
            </span>
          </span>
        </button>
      ))}
      {error ? <p className="text-[var(--danger)] sm:col-span-2 xl:col-span-3" role="alert">{error}</p> : null}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TH } from "@/lib/i18n/th";

export function OrgSelectForm(props: {
  organizations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <ul className="mt-6 grid gap-3">
      {props.organizations.map((org) => (
        <li key={org.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-60"
            disabled={pending}
            aria-busy={pending && selectedId === org.id}
            onClick={() => {
              setError(null);
              setSelectedId(org.id);
              start(async () => {
                const res = await fetch("/api/platform/context", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    organizationId: org.id,
                    branchId: null,
                  }),
                });
                if (!res.ok) {
                  setError(TH.access.forbidden);
                  return;
                }
                router.replace("/");
                router.refresh();
              });
            }}
          >
            <span>
              <span className="block font-semibold text-[var(--text-primary)]">
                {org.name}
              </span>
              <span className="mt-0.5 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {pending && selectedId === org.id
                  ? TH.common.loading
                  : TH.common.continue}
              </span>
            </span>
            <span aria-hidden="true" className="text-[var(--primary)]">
              →
            </span>
          </button>
        </li>
      ))}
      {error ? (
        <li className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </li>
      ) : null}
    </ul>
  );
}

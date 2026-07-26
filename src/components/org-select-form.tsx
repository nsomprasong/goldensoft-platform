"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
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
      {props.organizations.map((org) => {
        const isSelected = pending && selectedId === org.id;
        const actionLabel = isSelected ? TH.common.loading : TH.common.continue;

        return (
          <li
            key={org.id}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
          >
            <div className="min-w-0 flex-1">
              <span className="block font-semibold text-[var(--text-primary)]">
                {org.name}
              </span>
              <span className="mt-0.5 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {TH.common.continue}
              </span>
            </div>
            <IconTextButton
              type="button"
              variant="outline"
              disabled={pending}
              aria-busy={isSelected}
              icon={
                <Building2
                  className={isSelected ? "animate-pulse" : undefined}
                  aria-hidden="true"
                />
              }
              label={actionLabel}
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
            />
          </li>
        );
      })}
      {error ? (
        <li className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </li>
      ) : null}
    </ul>
  );
}

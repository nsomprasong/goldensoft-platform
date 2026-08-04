"use client";

import { GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { TH } from "@/lib/i18n/th";

export function BranchSelectForm(props: {
  organizationId: string;
  organizationName: string;
  branches: Array<{ id: string; name: string; code: string }>;
  /** Allow 「ทุกสาขา」 (branchId null) after explicit choice. */
  allowAllBranches?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  function choose(branchId: string | null, key: string) {
    setError(null);
    setSelectedKey(key);
    start(async () => {
      const res = await fetch("/api/platform/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: props.organizationId,
          branchId,
          branchSelected: true,
          mode: "membership",
        }),
      });
      if (!res.ok) {
        setError(TH.access.forbidden);
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
        {props.organizationName}
      </p>
      <ul className="grid gap-3">
        {props.allowAllBranches !== false ? (
          <li className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <span className="block font-semibold text-[var(--text-primary)]">
                {TH.pages.allBranchesOption}
              </span>
              <span className="mt-0.5 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {TH.pages.allBranchesHint}
              </span>
            </div>
            <IconTextButton
              type="button"
              variant="outline"
              disabled={pending}
              aria-busy={pending && selectedKey === "all"}
              icon={
                <GitBranch
                  className={
                    pending && selectedKey === "all" ? "animate-pulse" : undefined
                  }
                  aria-hidden="true"
                />
              }
              label={
                pending && selectedKey === "all"
                  ? TH.common.loading
                  : TH.common.continue
              }
              onClick={() => choose(null, "all")}
            />
          </li>
        ) : null}
        {props.branches.map((branch) => {
          const isSelected = pending && selectedKey === branch.id;
          return (
            <li
              key={branch.id}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <span className="block font-semibold text-[var(--text-primary)]">
                  {branch.name}
                </span>
              </div>
              <IconTextButton
                type="button"
                variant="outline"
                disabled={pending}
                aria-busy={isSelected}
                icon={
                  <GitBranch
                    className={isSelected ? "animate-pulse" : undefined}
                    aria-hidden="true"
                  />
                }
                label={isSelected ? TH.common.loading : TH.common.continue}
                onClick={() => choose(branch.id, branch.id)}
              />
            </li>
          );
        })}
        {error ? (
          <li
            className="text-[length:var(--text-helper)] text-[var(--danger)]"
            role="alert"
          >
            {error}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

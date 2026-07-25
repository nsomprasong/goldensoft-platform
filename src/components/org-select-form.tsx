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

  return (
    <ul className="mt-6 grid gap-3">
      {props.organizations.map((org) => (
        <li key={org.id}>
          <button
            type="button"
            className="card w-full text-left transition hover:shadow-md"
            disabled={pending}
            onClick={() => {
              setError(null);
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
            <span className="font-semibold">{org.name}</span>
            <span className="mt-1 block text-sm text-slate-600">
              {TH.common.continue}
            </span>
          </button>
        </li>
      ))}
      {error ? (
        <li className="text-sm text-red-700" role="alert">
          {error}
        </li>
      ) : null}
    </ul>
  );
}

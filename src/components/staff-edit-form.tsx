"use client";

import { Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  StaffIdentityFields,
  toStaffIdentityFormValues,
  type StaffIdentityFormValues,
} from "@/components/staff-identity-fields";
import { FormField, SectionHeader } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { pushToast } from "@/components/ui/toast";
import { labelStatus, TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";

const STATUS_OPTIONS = [
  MASTER.userProfileStatus.ACTIVE,
  MASTER.userProfileStatus.DISABLED,
] as const;

export function StaffEditForm(props: {
  userProfileId: string;
  initial: {
    email: string;
    statusCode: string;
    identity: StaffIdentityFormValues | null;
  };
}) {
  const router = useRouter();
  const [statusCode, setStatusCode] = useState(props.initial.statusCode);
  const [identity, setIdentity] = useState(() =>
    toStaffIdentityFormValues(props.initial.identity),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/platform/staff/${props.userProfileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...identity,
          statusCode,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!res.ok) {
        setError(data?.message ?? TH.common.failed);
        return;
      }
      pushToast(data?.message ?? TH.staff.updateSuccess);
      router.push("/staff");
      router.refresh();
    } catch {
      setError(TH.common.connectionError);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-3">
        <SectionHeader title={TH.staff.addSectionAccount} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label={TH.staff.email}
            htmlFor="email"
            hint={TH.staff.emailImmutable}
          >
            <Input
              id="email"
              value={props.initial.email}
              disabled
              className="disabled:bg-[var(--surface-muted)]"
            />
          </FormField>
          <FormField label={TH.staff.status} htmlFor="statusCode">
            <select
              id="statusCode"
              name="statusCode"
              className="input"
              value={statusCode}
              onChange={(event) => setStatusCode(event.target.value)}
            >
              {STATUS_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {labelStatus(code)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-5">
        <SectionHeader title={TH.staff.addSectionIdentity} />
        <StaffIdentityFields
          values={identity}
          onChange={(patch) => setIdentity((current) => ({ ...current, ...patch }))}
        />
      </section>

      {error ? (
        <p
          className="text-[length:var(--text-helper)] text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        <IconTextButton
          type="button"
          variant="outline"
          onClick={() => router.push("/staff")}
          icon={<X aria-hidden="true" />}
          label={TH.common.cancel}
        />
        <IconTextButton
          type="submit"
          disabled={pending}
          icon={
            <Save
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : TH.common.save}
        />
      </div>
    </form>
  );
}

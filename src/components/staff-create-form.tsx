"use client";

import { Mail, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  EMPTY_STAFF_IDENTITY,
  StaffIdentityFields,
  type StaffIdentityFormValues,
} from "@/components/staff-identity-fields";
import { FormField, SectionHeader } from "@/components/ui/admin-ui";
import {
  IconTextButton,
  labeledActionSoftClassName,
} from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

type PlatformRoleOption = { id: string; code: string; nameTh: string };

export function StaffCreateForm(props: {
  roles: PlatformRoleOption[];
  invitationsSendEnabled?: boolean;
}) {
  const router = useRouter();
  const invitationsSendEnabled = props.invitationsSendEnabled ?? false;
  const [email, setEmail] = useState("");
  const [identity, setIdentity] =
    useState<StaffIdentityFormValues>(EMPTY_STAFF_IDENTITY);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onRoleListChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedRoles(
      Array.from(event.target.selectedOptions, (option) => option.value),
    );
  }

  async function createStaff(sendInvite: boolean) {
    setError(null);
    if (selectedRoles.length === 0) {
      setError(TH.staff.selectRole);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/platform/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...identity,
          email: email.trim(),
          roleCodes: selectedRoles,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        staff?: { userProfileId?: string };
      } | null;
      if (!res.ok) {
        setError(data?.message ?? TH.common.failed);
        return;
      }

      if (sendInvite && data?.staff?.userProfileId) {
        const inviteRes = await fetch(
          `/api/platform/staff/${data.staff.userProfileId}/invite`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        const inviteData = (await inviteRes.json().catch(() => null)) as {
          message?: string;
        } | null;
        pushToast(
          inviteData?.message ??
            (inviteRes.ok ? TH.staff.inviteSuccess : TH.staff.createSuccess),
        );
        if (!inviteRes.ok) {
          setError(inviteData?.message ?? TH.common.failed);
          router.push("/staff");
          router.refresh();
          return;
        }
      } else {
        pushToast(data?.message ?? TH.staff.createSuccess);
      }

      router.push("/staff");
      router.refresh();
    } catch {
      setError(TH.common.connectionError);
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createStaff(false);
  }

  const listSize = Math.min(Math.max(props.roles.length, 4), 8);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate={false}>
      <section className="space-y-3">
        <SectionHeader
          title={TH.staff.addSectionAccount}
          description={TH.staff.emailImmutable}
        />
        <FormField label={TH.staff.email} htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            required
            maxLength={200}
            placeholder="name@goldensoft.co.th"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-5">
        <SectionHeader title={TH.staff.addSectionIdentity} />
        <StaffIdentityFields
          values={identity}
          onChange={(patch) => setIdentity((current) => ({ ...current, ...patch }))}
        />
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-5">
        <SectionHeader
          title={TH.staff.addSectionRoles}
          description={TH.staff.selectRoleListHint}
        />
        <FormField label={TH.staff.selectRole} htmlFor="roleCodes" required>
          <select
            id="roleCodes"
            name="roleCodes"
            multiple
            required
            size={listSize}
            value={selectedRoles}
            onChange={onRoleListChange}
            className="input min-h-40 py-2 leading-8"
          >
            {props.roles.map((role) => (
              <option key={role.id} value={role.code}>
                {role.nameTh} ({role.code})
              </option>
            ))}
          </select>
        </FormField>
        {selectedRoles.length > 0 ? (
          <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {TH.staff.rolesLabel}: {selectedRoles.join(", ")}
          </p>
        ) : null}
      </section>

      {error ? (
        <p
          className="text-[length:var(--text-helper)] text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4"
        role="group"
        aria-label={TH.common.actions}
      >
        {invitationsSendEnabled ? (
          <IconTextButton
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void createStaff(true)}
            className={labeledActionSoftClassName}
            icon={
              <Mail
                className={pending ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={pending ? TH.common.loading : TH.staff.createAndInvite}
          />
        ) : null}
        <IconTextButton
          type="submit"
          disabled={pending}
          icon={
            <UserPlus
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : TH.staff.add}
        />
      </div>
    </form>
  );
}

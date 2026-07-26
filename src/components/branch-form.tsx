"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Save, X } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function BranchForm(props: {
  organizationId: string;
  branchId?: string;
  mode: "create" | "edit";
  initial?: {
    code: string;
    name: string;
    nameEn: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    timezone: string;
    isPrimary: boolean;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEdit = props.mode === "edit";

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload = {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      nameEn: String(formData.get("nameEn") ?? "") || null,
      address: String(formData.get("address") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      timezone: String(formData.get("timezone") ?? "Asia/Bangkok"),
      isPrimary: formData.get("isPrimary") === "on",
    };

    const url = isEdit
      ? `/api/platform/organizations/${props.organizationId}/branches/admin/${props.branchId}`
      : `/api/platform/organizations/${props.organizationId}/branches/admin`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { ...payload, code: undefined } : payload),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.push(`/organizations/${props.organizationId}/branches`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label={TH.branch.code}
          htmlFor="code"
          required={!isEdit}
          hint={isEdit ? TH.branch.codeImmutable : undefined}
        >
          <Input
            id="code"
            name="code"
            required={!isEdit}
            disabled={isEdit}
            defaultValue={props.initial?.code ?? ""}
            className="disabled:bg-[var(--surface-muted)]"
          />
        </FormField>
        <FormField label={TH.branch.nameTh} htmlFor="name" required>
          <Input
            id="name"
            name="name"
            required
            defaultValue={props.initial?.name ?? ""}
          />
        </FormField>
        <FormField label={TH.branch.nameEn} htmlFor="nameEn">
          <Input
            id="nameEn"
            name="nameEn"
            defaultValue={props.initial?.nameEn ?? ""}
          />
        </FormField>
        <FormField label={TH.branch.timezone} htmlFor="timezone">
          <Input
            id="timezone"
            name="timezone"
            defaultValue={props.initial?.timezone ?? "Asia/Bangkok"}
          />
        </FormField>
        <FormField label={TH.branch.email} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={props.initial?.email ?? ""}
          />
        </FormField>
        <FormField label={TH.branch.phone} htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            defaultValue={props.initial?.phone ?? ""}
          />
        </FormField>
      </div>
      <FormField label={TH.branch.address} htmlFor="address">
        <Input
          id="address"
          name="address"
          defaultValue={props.initial?.address ?? ""}
        />
      </FormField>
      <label className="flex min-h-11 items-center gap-2 text-[length:var(--text-label)]">
        <input
          type="checkbox"
          name="isPrimary"
          defaultChecked={props.initial?.isPrimary ?? false}
        />
        {TH.branch.isPrimary}
      </label>
      {error ? (
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        <IconTextButton
          type="button"
          variant="outline"
          onClick={() => router.back()}
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
          label={
            pending ? TH.common.loading : isEdit ? TH.common.save : TH.branch.add
          }
        />
      </div>
    </form>
  );
}

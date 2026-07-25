"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/ui/admin-ui";
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
          <input
            id="code"
            name="code"
            required={!isEdit}
            disabled={isEdit}
            defaultValue={props.initial?.code ?? ""}
            className="input disabled:bg-[var(--surface-muted)]"
          />
        </FormField>
        <FormField label={TH.branch.nameTh} htmlFor="name" required>
          <input
            id="name"
            name="name"
            required
            defaultValue={props.initial?.name ?? ""}
            className="input"
          />
        </FormField>
        <FormField label={TH.branch.nameEn} htmlFor="nameEn">
          <input
            id="nameEn"
            name="nameEn"
            defaultValue={props.initial?.nameEn ?? ""}
            className="input"
          />
        </FormField>
        <FormField label={TH.branch.timezone} htmlFor="timezone">
          <input
            id="timezone"
            name="timezone"
            defaultValue={props.initial?.timezone ?? "Asia/Bangkok"}
            className="input"
          />
        </FormField>
        <FormField label={TH.branch.email} htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={props.initial?.email ?? ""}
            className="input"
          />
        </FormField>
        <FormField label={TH.branch.phone} htmlFor="phone">
          <input
            id="phone"
            name="phone"
            defaultValue={props.initial?.phone ?? ""}
            className="input"
          />
        </FormField>
      </div>
      <FormField label={TH.branch.address} htmlFor="address">
        <input
          id="address"
          name="address"
          defaultValue={props.initial?.address ?? ""}
          className="input"
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
      <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="btn btn-secondary btn-block-mobile"
          onClick={() => router.back()}
        >
          {TH.common.cancel}
        </button>
        <button type="submit" className="btn btn-block-mobile" disabled={pending}>
          {pending ? TH.common.loading : isEdit ? TH.common.save : TH.branch.add}
        </button>
      </div>
    </form>
  );
}

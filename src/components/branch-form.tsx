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
    <form action={onSubmit} className="space-y-3">
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
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 disabled:bg-slate-50"
        />
      </FormField>
      <FormField label={TH.branch.nameTh} htmlFor="name" required>
        <input id="name" name="name" required defaultValue={props.initial?.name ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.branch.nameEn} htmlFor="nameEn">
        <input id="nameEn" name="nameEn" defaultValue={props.initial?.nameEn ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.branch.address} htmlFor="address">
        <input id="address" name="address" defaultValue={props.initial?.address ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.branch.email} htmlFor="email">
        <input id="email" name="email" type="email" defaultValue={props.initial?.email ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.branch.phone} htmlFor="phone">
        <input id="phone" name="phone" defaultValue={props.initial?.phone ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.branch.timezone} htmlFor="timezone">
        <input id="timezone" name="timezone" defaultValue={props.initial?.timezone ?? "Asia/Bangkok"} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPrimary"
          defaultChecked={props.initial?.isPrimary ?? false}
        />
        {TH.branch.isPrimary}
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? TH.common.loading : isEdit ? TH.common.save : TH.branch.add}
      </button>
    </form>
  );
}

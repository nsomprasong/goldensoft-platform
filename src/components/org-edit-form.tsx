"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/ui/admin-ui";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function OrgEditForm(props: {
  organizationId: string;
  initial: {
    displayName: string;
    legalName: string;
    nameEn: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    customerCode: string;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload = {
      displayName: String(formData.get("displayName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      nameEn: String(formData.get("nameEn") ?? "") || null,
      taxId: String(formData.get("taxId") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      address: String(formData.get("address") ?? "") || null,
    };
    const res = await fetch(
      `/api/platform/organizations/admin/${props.organizationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.push(`/organizations/${props.organizationId}`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <FormField label={TH.org.code} htmlFor="customerCode" hint={TH.org.codeImmutable}>
        <input
          id="customerCode"
          value={props.initial.customerCode}
          disabled
          className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2"
        />
      </FormField>
      <FormField label={TH.org.nameTh} htmlFor="displayName" required>
        <input id="displayName" name="displayName" required defaultValue={props.initial.displayName} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.legalName} htmlFor="legalName" required>
        <input id="legalName" name="legalName" required defaultValue={props.initial.legalName} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.nameEn} htmlFor="nameEn">
        <input id="nameEn" name="nameEn" defaultValue={props.initial.nameEn ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.taxId} htmlFor="taxId">
        <input id="taxId" name="taxId" defaultValue={props.initial.taxId ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.email} htmlFor="email">
        <input id="email" name="email" type="email" defaultValue={props.initial.email ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.phone} htmlFor="phone">
        <input id="phone" name="phone" defaultValue={props.initial.phone ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.address} htmlFor="address">
        <textarea id="address" name="address" defaultValue={props.initial.address ?? ""} className="w-full rounded-lg border border-[var(--border)] px-3 py-2" rows={3} />
      </FormField>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? TH.common.loading : TH.common.save}
      </button>
    </form>
  );
}

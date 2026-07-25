"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/ui/admin-ui";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function OrgCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload = {
      customerCode: String(formData.get("customerCode") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      nameEn: String(formData.get("nameEn") ?? "") || null,
      taxId: String(formData.get("taxId") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      address: String(formData.get("address") ?? "") || null,
    };
    const res = await fetch("/api/platform/organizations/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { message?: string; organization?: { id: string } };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.push(`/organizations/${data.organization?.id ?? ""}`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <FormField label={TH.org.code} htmlFor="customerCode" required>
        <input id="customerCode" name="customerCode" required className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label="Slug" htmlFor="slug" required hint="a-z0-9-">
        <input id="slug" name="slug" required pattern="[a-z0-9-]+" className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.nameTh} htmlFor="displayName" required>
        <input id="displayName" name="displayName" required className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.legalName} htmlFor="legalName" required>
        <input id="legalName" name="legalName" required className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.nameEn} htmlFor="nameEn">
        <input id="nameEn" name="nameEn" className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.taxId} htmlFor="taxId">
        <input id="taxId" name="taxId" className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.email} htmlFor="email">
        <input id="email" name="email" type="email" className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.phone} htmlFor="phone">
        <input id="phone" name="phone" className="w-full rounded-lg border border-[var(--border)] px-3 py-2" />
      </FormField>
      <FormField label={TH.org.address} htmlFor="address">
        <textarea id="address" name="address" className="w-full rounded-lg border border-[var(--border)] px-3 py-2" rows={3} />
      </FormField>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? TH.common.loading : TH.org.add}
      </button>
    </form>
  );
}

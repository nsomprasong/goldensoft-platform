"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Save, X } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
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
    <form action={onSubmit} className="space-y-4">
      <FormField label={TH.org.code} htmlFor="customerCode" hint={TH.org.codeImmutable}>
        <Input
          id="customerCode"
          value={props.initial.customerCode}
          disabled
          className="disabled:bg-[var(--surface-muted)]"
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={TH.org.nameTh} htmlFor="displayName" required>
          <Input
            id="displayName"
            name="displayName"
            required
            defaultValue={props.initial.displayName}
          />
        </FormField>
        <FormField label={TH.org.legalName} htmlFor="legalName" required>
          <Input
            id="legalName"
            name="legalName"
            required
            defaultValue={props.initial.legalName}
          />
        </FormField>
        <FormField label={TH.org.nameEn} htmlFor="nameEn">
          <Input
            id="nameEn"
            name="nameEn"
            defaultValue={props.initial.nameEn ?? ""}
          />
        </FormField>
        <FormField label={TH.org.taxId} htmlFor="taxId">
          <Input
            id="taxId"
            name="taxId"
            defaultValue={props.initial.taxId ?? ""}
          />
        </FormField>
        <FormField label={TH.org.email} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={props.initial.email ?? ""}
          />
        </FormField>
        <FormField label={TH.org.phone} htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            defaultValue={props.initial.phone ?? ""}
          />
        </FormField>
      </div>
      <FormField label={TH.org.address} htmlFor="address">
        <textarea
          id="address"
          name="address"
          defaultValue={props.initial.address ?? ""}
          className="textarea"
          rows={3}
        />
      </FormField>
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
          label={pending ? TH.common.loading : TH.common.save}
        />
      </div>
    </form>
  );
}

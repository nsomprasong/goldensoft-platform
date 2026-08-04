"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pause, Play, Save, X } from "lucide-react";

import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";

export function ProductForm(props: {
  mode: "create" | "edit";
  productId?: string;
  initial?: {
    code: string;
    nameTh: string;
    nameEn: string;
    description: string | null;
    productType: string;
    sortOrder: number;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload =
      props.mode === "create"
        ? {
            code: String(formData.get("code") ?? "")
              .trim()
              .toUpperCase(),
            nameTh: String(formData.get("nameTh") ?? "").trim(),
            nameEn: String(formData.get("nameEn") ?? "").trim(),
            description: String(formData.get("description") ?? "").trim() || null,
            productType: String(formData.get("productType") ?? "APPLICATION"),
            sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
          }
        : {
            nameTh: String(formData.get("nameTh") ?? "").trim(),
            nameEn: String(formData.get("nameEn") ?? "").trim(),
            description: String(formData.get("description") ?? "").trim() || null,
            productType: String(formData.get("productType") ?? "APPLICATION"),
            sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
          };

    const res = await fetch(
      props.mode === "create"
        ? "/api/platform/products"
        : `/api/platform/products/${props.productId}`,
      {
        method: props.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await res.json()) as {
      message?: string;
      product?: { id: string };
    };
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.push(
      props.mode === "create" && data.product?.id
        ? `/products/${data.product.id}`
        : `/products/${props.productId}`,
    );
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <FormField label="รหัสผลิตภัณฑ์" htmlFor="code" required>
        <Input
          id="code"
          name="code"
          required={props.mode === "create"}
          disabled={props.mode === "edit"}
          defaultValue={props.initial?.code ?? ""}
          className="disabled:bg-[var(--surface-muted)]"
          placeholder="RESIDENT_V2"
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="ชื่อภาษาไทย" htmlFor="nameTh" required>
          <Input
            id="nameTh"
            name="nameTh"
            required
            defaultValue={props.initial?.nameTh ?? ""}
          />
        </FormField>
        <FormField label="ชื่อภาษาอังกฤษ" htmlFor="nameEn" required>
          <Input
            id="nameEn"
            name="nameEn"
            required
            defaultValue={props.initial?.nameEn ?? ""}
          />
        </FormField>
        <FormField label="ประเภท" htmlFor="productType">
          <Input
            id="productType"
            name="productType"
            defaultValue={props.initial?.productType ?? "APPLICATION"}
          />
        </FormField>
        <FormField label="ลำดับการแสดง" htmlFor="sortOrder">
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={props.initial?.sortOrder ?? 0}
          />
        </FormField>
      </div>
      <FormField label="คำอธิบาย" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={props.initial?.description ?? ""}
          className="input"
        />
      </FormField>
      <div className="flex flex-wrap items-center justify-end gap-2">
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
        <IconTextButton
          type="button"
          variant="outline"
          onClick={() => router.back()}
          icon={<X aria-hidden="true" />}
          label={TH.common.cancel}
        />
      </div>
    </form>
  );
}

export function ProductStatusActions(props: {
  productId: string;
  statusCode: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: "activate" | "deactivate") {
    setPending(true);
    const res = await fetch(`/api/platform/products/${props.productId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as { message?: string };
    setPending(false);
    if (!res.ok) {
      pushToast(data.message ?? TH.common.failed);
      return;
    }
    pushToast(TH.common.saved);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.statusCode !== "ACTIVE" ? (
        <IconTextButton
          type="button"
          disabled={pending}
          onClick={() => void run("activate")}
          icon={
            <Play
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "เปิดใช้งาน"}
        />
      ) : (
        <IconTextButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void run("deactivate")}
          icon={
            <Pause
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "ปิดใช้งาน"}
        />
      )}
    </div>
  );
}

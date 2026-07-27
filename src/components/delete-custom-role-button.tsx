"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/lib/utils";

export function DeleteCustomRoleButton(props: {
  roleId: string;
  roleName: string;
  size?: "sm" | "default";
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    const ok = window.confirm(
      `ลบบทบาท「${props.roleName}」ถาวร?\nการลบจะทำไม่ได้หากยังมีผู้ใช้หรือคำเชิญอ้างอิงบทบาทนี้`,
    );
    if (!ok) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/platform/roles/${props.roleId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        const message = data.message ?? "ลบบทบาทไม่สำเร็จ";
        setError(message);
        pushToast(message);
        return;
      }
      pushToast("ลบบทบาทแล้ว");
      if (props.redirectTo) {
        router.push(props.redirectTo);
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-1">
      <IconTextButton
        type="button"
        size={props.size}
        variant="outline"
        disabled={pending}
        onClick={onDelete}
        icon={
          <Trash2
            className={cn("size-3.5", pending ? "animate-pulse" : undefined)}
            aria-hidden="true"
          />
        }
        label={pending ? TH.common.loading : TH.common.delete}
        className={cn(
          "border-red-200 bg-red-50 text-red-700 shadow-none hover:border-red-300 hover:bg-red-100 hover:text-red-800",
          props.className,
        )}
      />
      {error ? (
        <p className="max-w-[12rem] text-right text-[11px] text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

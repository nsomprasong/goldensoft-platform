"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/lib/utils";

export function DeleteCustomRoleButton(props: {
  roleId: string;
  organizationId: string;
  roleName: string;
  size?: "sm" | "default";
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    start(async () => {
      const query = new URLSearchParams({ organizationId: props.organizationId });
      const response = await fetch(`/api/platform/roles/${props.roleId}?${query}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        const message = data.message ?? "ลบบทบาทไม่สำเร็จ";
        setError(message);
        pushToast(message);
        return;
      }
      pushToast("ลบบทบาทแล้ว");
      if (props.redirectTo) router.push(props.redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-1">
      <Dialog>
        <DialogTrigger asChild>
          <IconTextButton
            type="button"
            size={props.size}
            variant="outline"
            disabled={pending}
            icon={<Trash2 className={cn("size-3.5", pending ? "animate-pulse" : undefined)} aria-hidden="true" />}
            label={pending ? TH.common.loading : TH.common.delete}
            className={cn("border-[var(--destructive-border)] bg-[var(--destructive-soft)] text-[var(--destructive)] shadow-none", props.className)}
          />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการลบบทบาท</DialogTitle>
            <DialogDescription>
              ต้องการลบบทบาท “{props.roleName}” หรือไม่ การลบจะทำไม่ได้หากยังมีผู้ใช้หรือคำเชิญอ้างอิงบทบาทนี้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <IconTextButton type="button" variant="outline" label="ยกเลิก" />
            </DialogClose>
            <DialogClose asChild>
              <IconTextButton type="button" disabled={pending} onClick={onDelete} icon={<Trash2 aria-hidden="true" />} label="ยืนยันการลบ" />
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error ? <p className="max-w-[12rem] text-right text-[11px] text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

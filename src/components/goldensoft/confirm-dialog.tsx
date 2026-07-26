"use client";

import { Check, X } from "lucide-react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const cancelLabel = props.cancelLabel ?? "ยกเลิก";
  const confirmLabel = props.pending
    ? "กำลังดำเนินการ..."
    : (props.confirmLabel ?? "ยืนยัน");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-wrap items-center justify-end gap-2">
          <IconTextButton
            type="button"
            variant="outline"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
            icon={<X aria-hidden="true" />}
            label={cancelLabel}
          />
          <IconTextButton
            type="button"
            variant={props.destructive ? "destructive" : "default"}
            disabled={props.pending}
            onClick={props.onConfirm}
            icon={<Check aria-hidden="true" />}
            label={confirmLabel}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

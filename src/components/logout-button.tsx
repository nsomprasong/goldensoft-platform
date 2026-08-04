"use client";

import { LogOut } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/goldensoft/confirm-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { signOutAction } from "@/lib/auth/actions";
import { TH } from "@/lib/i18n/th";

export function LogoutButton({
  className,
  variant = "outline",
  appearance = "icon",
  ...props
}: Omit<ButtonProps, "children" | "size"> & {
  appearance?: "icon" | "text";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const label = pending ? TH.common.loading : TH.nav.logout;

  const confirmLogout = () => {
    start(() => signOutAction());
  };

  return (
    <>
      {appearance === "text" ? (
        <IconTextButton
          type="button"
          variant={variant}
          className={className}
          disabled={pending}
          onClick={() => setOpen(true)}
          icon={
            <LogOut
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={label}
          {...props}
        />
      ) : (
        <Button
          type="button"
          variant={variant}
          size="icon"
          className={className}
          disabled={pending}
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          {...props}
        >
          <LogOut
            className={pending ? "animate-pulse" : undefined}
            aria-hidden="true"
          />
        </Button>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={TH.nav.logoutConfirmTitle}
        description={TH.nav.logoutConfirmBody}
        confirmLabel={TH.nav.logoutConfirmAction}
        cancelLabel={TH.common.cancel}
        destructive
        pending={pending}
        onConfirm={confirmLogout}
      />
    </>
  );
}

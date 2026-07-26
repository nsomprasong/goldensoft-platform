"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

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
  const [pending, start] = useTransition();
  const label = pending ? TH.common.loading : TH.nav.logout;
  const onClick = () => start(() => signOutAction());

  if (appearance === "text") {
    return (
      <IconTextButton
        type="button"
        variant={variant}
        className={className}
        disabled={pending}
        onClick={onClick}
        icon={
          <LogOut
            className={pending ? "animate-pulse" : undefined}
            aria-hidden="true"
          />
        }
        label={label}
        {...props}
      />
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      className={className}
      disabled={pending}
      onClick={onClick}
      aria-label={label}
      title={label}
      {...props}
    >
      <LogOut
        className={pending ? "animate-pulse" : undefined}
        aria-hidden="true"
      />
    </Button>
  );
}

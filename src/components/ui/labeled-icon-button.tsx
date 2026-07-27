import Link from "next/link";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CommonProps = {
  icon: ReactNode;
  label: string;
  /** Tooltip / native title (defaults to label) */
  hint?: string;
  className?: string;
  labelClassName?: string;
  stackClassName?: string;
};

/**
 * Compact toolbar/table action: icon on top, caption below.
 * Use only for dense secondary actions (e.g. resend invite in a row).
 */
export function LabeledIconButton({
  icon,
  label,
  hint,
  className,
  labelClassName,
  stackClassName,
  size = "icon",
  variant = "default",
  ...props
}: CommonProps & Omit<ButtonProps, "children" | "size"> & { size?: ButtonProps["size"] }) {
  const title = hint ?? label;
  return (
    <div
      className={cn(
        "inline-flex max-w-[5.5rem] flex-col items-center gap-1",
        stackClassName,
      )}
    >
      <Button
        size={size}
        variant={variant}
        aria-label={label}
        title={title}
        className={cn(
          "size-10 shrink-0 rounded-[var(--radius-md)]",
          className,
        )}
        {...props}
      >
        {icon}
      </Button>
      <span
        className={cn(
          "w-full text-center text-[length:var(--text-caption)] font-medium leading-tight text-[var(--text-muted)]",
          labelClassName,
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Soft primary chip used for dense row actions (invite / reset / etc.). */
export const labeledActionSoftClassName =
  "border-[var(--page-header-border)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-xs)] hover:border-[var(--primary)]/40 hover:bg-[var(--primary-soft)] hover:text-[var(--primary-hover)]";

export function LabeledIconLink({
  href,
  icon,
  label,
  hint,
  className,
  labelClassName,
  stackClassName,
  variant = "default",
  size = "icon",
}: CommonProps & {
  href: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const title = hint ?? label;
  return (
    <div
      className={cn(
        "inline-flex max-w-[5.5rem] flex-col items-center gap-1",
        stackClassName,
      )}
    >
      <Button
        asChild
        size={size}
        variant={variant}
        className={cn(
          "size-10 shrink-0 rounded-[var(--radius-md)]",
          className,
        )}
      >
        <Link href={href} aria-label={label} title={title}>
          {icon}
        </Link>
      </Button>
      <span
        className={cn(
          "w-full text-center text-[length:var(--text-caption)] font-medium leading-tight text-[var(--text-muted)]",
          labelClassName,
        )}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Standard action button: optional leading icon + text label in one control.
 * Prefer this for headers, forms, auth, wizards, and filters.
 */
export function IconTextButton({
  icon,
  label,
  className,
  ...props
}: {
  icon?: ReactNode;
  label: string;
} & Omit<ButtonProps, "children">) {
  return (
    <Button className={cn(icon ? "gap-2" : undefined, className)} {...props}>
      {icon}
      <span>{label}</span>
    </Button>
  );
}

export function IconTextLink({
  href,
  icon,
  label,
  className,
  variant = "default",
  size = "default",
}: {
  href: string;
  icon?: ReactNode;
  label: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn(icon ? "gap-2" : undefined, className)}
    >
      <Link href={href}>
        {icon}
        <span>{label}</span>
      </Link>
    </Button>
  );
}

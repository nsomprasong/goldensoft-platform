import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-[var(--radius-lg)] border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-0.125rem] [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default:
          "border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]",
        destructive:
          "border-[var(--destructive-border)] bg-[var(--destructive-soft)] text-[var(--destructive)]",
        success:
          "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
        warning:
          "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
        info: "border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5 className={cn("mb-1 font-semibold leading-none", className)} {...props} />
  );
}

export function AlertDescription({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("leading-relaxed", className)} {...props} />;
}

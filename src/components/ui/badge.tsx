import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide shadow-[var(--shadow-xs)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-b from-[#c2610f] to-[var(--primary)] text-[var(--primary-foreground)]",
        secondary:
          "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        outline: "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
        success:
          "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
        warning:
          "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
        destructive:
          "border-[var(--destructive-border)] bg-[var(--destructive-soft)] text-[var(--destructive)]",
        info: "border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };

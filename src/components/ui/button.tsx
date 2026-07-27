import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-transparent px-4 py-2 text-sm font-semibold leading-none transition-[background-color,border-color,box-shadow,transform,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--primary)] shadow-none hover:-translate-y-px hover:border-[#fcd34d] hover:bg-[#fef3c7] hover:text-[var(--primary-hover)]",
        secondary:
          "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:-translate-y-px hover:bg-[var(--muted)] hover:shadow-[var(--shadow-sm)]",
        outline:
          "border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-xs)] hover:-translate-y-px hover:border-[var(--primary)]/35 hover:bg-[var(--primary-soft)] hover:shadow-[var(--shadow-sm)]",
        ghost:
          "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
        destructive:
          "bg-gradient-to-b from-[#dc2626] to-[var(--destructive)] text-[var(--destructive-foreground)] shadow-[0_8px_20px_rgba(185,28,28,0.22)] hover:-translate-y-px hover:to-[var(--destructive-hover)]",
        link: "min-h-0 rounded-none p-0 text-[var(--primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10",
        sm: "min-h-9 px-3 text-xs",
        lg: "min-h-11 px-5",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };

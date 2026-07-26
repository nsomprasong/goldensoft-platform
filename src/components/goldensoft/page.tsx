import { AlertCircle, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AppPage({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("space-y-5", className)} {...props} />;
}

export function PageTitle({
  className,
  ...props
}: ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "text-xl font-semibold leading-tight text-[var(--foreground)] sm:text-2xl",
        className,
      )}
      {...props}
    />
  );
}

export function PageDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-sm leading-relaxed text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function PageActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader(props: {
  title: string;
  description?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--page-header-border)] bg-[var(--page-header-background)] p-4 shadow-[var(--shadow-sm)] sm:p-5",
        props.className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {props.icon ? (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] text-[var(--primary)] shadow-[var(--shadow-xs)]">
              {props.icon}
            </div>
          ) : null}
          <div className="min-w-0">
            {props.breadcrumb ? (
              <div className="mb-1 text-xs text-[var(--muted-foreground)]">
                {props.breadcrumb}
              </div>
            ) : null}
            <h1 className="text-xl font-semibold leading-tight text-[var(--foreground)] sm:text-2xl">
              {props.title}
            </h1>
            {props.description ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
                {props.description}
              </p>
            ) : null}
            {props.meta ? <div className="mt-2">{props.meta}</div> : null}
          </div>
        </div>
        {props.actions ? (
          <div className="flex w-full flex-wrap items-start justify-end gap-3 sm:w-auto">
            {props.actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function SectionCard(props: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={props.className}>
      {props.title || props.description || props.actions ? (
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {props.title ? <CardTitle>{props.title}</CardTitle> : null}
            {props.description ? (
              <CardDescription>{props.description}</CardDescription>
            ) : null}
          </div>
          {props.actions}
        </CardHeader>
      ) : null}
      <CardContent
        className={cn(
          !props.title && !props.description && !props.actions && "pt-4 sm:pt-5",
          props.contentClassName,
        )}
      >
        {props.children}
      </CardContent>
    </Card>
  );
}

export function StatCard(props: {
  label: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", props.className)}>
      <CardContent className="flex items-start justify-between gap-3 pt-4 sm:pt-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            {props.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
            {props.value}
          </p>
          {props.description ? (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {props.description}
            </p>
          ) : null}
        </div>
        {props.icon ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent)] text-[var(--accent-foreground)]">
            {props.icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState(props: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--muted)]/50 px-5 py-10 text-center",
        props.className,
      )}
    >
      {props.icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--card)] text-[var(--muted-foreground)] shadow-[var(--shadow-xs)]">
          {props.icon}
        </div>
      ) : null}
      <h3 className="font-semibold text-[var(--foreground)]">{props.title}</h3>
      {props.description ? (
        <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
          {props.description}
        </p>
      ) : null}
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "กำลังโหลดข้อมูล..." }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ErrorState(props: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--destructive-border)] bg-[var(--destructive-soft)] p-4 text-[var(--destructive)]"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h3 className="font-semibold">{props.title ?? "เกิดข้อผิดพลาด"}</h3>
          <p className="mt-1 text-sm">{props.description}</p>
          {props.action ? <div className="mt-3">{props.action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function SearchInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
      <Input className="pl-9" type="search" {...props} />
    </div>
  );
}

export function FilterBar({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)] sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatusBadge({
  className,
  ...props
}: BadgeProps) {
  return <Badge className={cn("whitespace-nowrap", className)} {...props} />;
}

export function DataTableContainer({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)]",
        className,
      )}
      {...props}
    />
  );
}

export function FormSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] p-4 sm:p-5",
        props.className,
      )}
    >
      <legend className="px-1 font-semibold text-[var(--foreground)]">
        {props.title}
      </legend>
      {props.description ? (
        <p className="-mt-2 text-sm text-[var(--muted-foreground)]">
          {props.description}
        </p>
      ) : null}
      {props.children}
    </fieldset>
  );
}

export function FormActions({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MobileActionBar({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-5 flex gap-2 border-t border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-[var(--shadow-lg)] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Button };

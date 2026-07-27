import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "pending";

const STATUS_TONE_BY_CODE: Record<string, StatusTone> = {
  ACTIVE: "success",
  PUBLISHED: "success",
  COMPLETED: "success",
  AUTH_SENT: "info",
  INVITED: "info",
  TRIAL: "info",
  PENDING: "pending",
  DRAFT: "pending",
  INACTIVE: "neutral",
  DISABLED: "neutral",
  RETIRED: "neutral",
  CLOSED: "neutral",
  REMOVED: "neutral",
  SUSPENDED: "warning",
  PAST_DUE: "warning",
  EXPIRED: "warning",
  CANCELLED: "danger",
  FAILED: "danger",
  PLATFORM_SETUP_FAILED: "danger",
};

/** Exported for design-system tests — keep in sync with StatusBadge mapping. */
export const STATUS_CODES_WITH_TONES = Object.keys(STATUS_TONE_BY_CODE);

const TONE_TO_BADGE: Record<
  StatusTone,
  "secondary" | "success" | "warning" | "destructive" | "info" | "default"
> = {
  neutral: "secondary",
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  pending: "default",
};

export function statusToneForCode(code?: string | null): StatusTone {
  if (!code) return "neutral";
  return STATUS_TONE_BY_CODE[code] ?? "neutral";
}

export function PageHeader(props: {
  title: string;
  description?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  secondaryActions?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  status?: ReactNode;
  context?: ReactNode;
}) {
  return (
    <header className="page-header mb-5 overflow-hidden rounded-[var(--radius-xl)] border shadow-[var(--shadow-md)]">
      <div className="page-header-content">
        <div className="flex min-w-0 flex-1 gap-3">
          {props.icon ? (
            <div
              className="page-header-icon inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] text-[var(--primary)] shadow-[var(--shadow-xs)]"
              aria-hidden="true"
            >
              {props.icon}
            </div>
          ) : (
            <span
              className="mt-1 hidden h-8 w-1 shrink-0 rounded-full bg-[var(--primary)] sm:block"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            {props.breadcrumb ? (
              <div className="mb-1 text-xs text-[var(--muted-foreground)]">
                {props.breadcrumb}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold leading-tight text-[var(--foreground)] sm:text-2xl">
                {props.title}
              </h1>
              {props.status}
            </div>
            {props.description ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
                {props.description}
              </p>
            ) : null}
            {props.context ? <div className="mt-2">{props.context}</div> : null}
            {props.meta ? <div className="mt-2">{props.meta}</div> : null}
          </div>
        </div>
        {props.actions || props.secondaryActions ? (
          <div className="page-header-actions">
            {props.secondaryActions}
            {props.actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function SectionHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            {props.title}
          </h2>
          {props.badge}
        </div>
        {props.description ? (
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.actions}
    </div>
  );
}

export type StatAccent =
  | "blue"
  | "green"
  | "violet"
  | "amber"
  | "orange"
  | "neutral";

const STAT_ACCENT: Record<
  StatAccent,
  { card: string; icon: string; bar: string }
> = {
  blue: {
    card: "stat-card--blue",
    icon: "stat-icon--blue",
    bar: "stat-bar--blue",
  },
  green: {
    card: "stat-card--green",
    icon: "stat-icon--green",
    bar: "stat-bar--green",
  },
  violet: {
    card: "stat-card--violet",
    icon: "stat-icon--violet",
    bar: "stat-bar--violet",
  },
  amber: {
    card: "stat-card--amber",
    icon: "stat-icon--amber",
    bar: "stat-bar--amber",
  },
  orange: {
    card: "stat-card--orange",
    icon: "stat-icon--orange",
    bar: "stat-bar--orange",
  },
  neutral: {
    card: "stat-card--neutral",
    icon: "stat-icon--neutral",
    bar: "stat-bar--neutral",
  },
};

export function StatCard(props: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon?: ReactNode;
  accent?: StatAccent;
}) {
  const accent = STAT_ACCENT[props.accent ?? "neutral"];
  const content = (
    <>
      <span
        className={`stat-bar absolute inset-y-0 left-0 w-1 rounded-l-[var(--radius-lg)] ${accent.bar}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {props.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
            {props.value}
          </p>
          {props.hint ? (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {props.hint}
            </p>
          ) : null}
        </div>
        {props.icon ? (
          <span
            className={`stat-icon inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${accent.icon}`}
            aria-hidden="true"
          >
            {props.icon}
          </span>
        ) : null}
      </div>
    </>
  );
  const className = cn("stat-card", accent.card);
  if (props.href) {
    return (
      <a href={props.href} className={className}>
        {content}
      </a>
    );
  }
  return <div className={className}>{content}</div>;
}

export function LoadingState({ label = "กำลังโหลดข้อมูล..." }: { label?: string }) {
  return (
    <Card role="status" aria-live="polite">
      <CardContent className="space-y-3 pt-4 sm:pt-5">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

export function EmptyState(props: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--muted)]/50 px-6 py-10 text-center">
      <p className="font-semibold text-[var(--foreground)]">{props.title}</p>
      {props.body ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
          {props.body}
        </p>
      ) : null}
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}

export function AccessDenied(props: { title: string; body: string }) {
  return (
    <Card className="alert-danger border-[var(--destructive-border)] bg-[var(--destructive-soft)]" role="alert">
      <CardContent className="pt-4 sm:pt-5">
        <h2 className="text-lg font-semibold text-[var(--destructive)]">{props.title}</h2>
        <p className="mt-2 text-sm text-[var(--destructive)]">{props.body}</p>
      </CardContent>
    </Card>
  );
}

export function ErrorState(props: { title: string; body?: string }) {
  return (
    <Card className="alert-danger border-[var(--destructive-border)] bg-[var(--destructive-soft)]" role="alert">
      <CardContent className="pt-4 sm:pt-5">
        <h2 className="font-semibold text-[var(--destructive)]">{props.title}</h2>
        {props.body ? (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{props.body}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StatusBadge(props: {
  label: string;
  code?: string;
  tone?: StatusTone;
}) {
  const tone = props.tone ?? statusToneForCode(props.code);
  return (
    <Badge variant={TONE_TO_BADGE[tone]} className="whitespace-nowrap">
      {props.label}
    </Badge>
  );
}

export function FormField(props: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="block text-sm">
      <label
        htmlFor={props.htmlFor}
        className="mb-1.5 block font-medium text-[var(--foreground)]"
      >
        {props.label}
        {props.required ? (
          <span className="text-[var(--destructive)]" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {props.children}
      {props.hint && !props.error ? (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{props.hint}</p>
      ) : null}
      {props.error ? (
        <p className="mt-1 text-xs text-[var(--destructive)]" role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export function SearchFilterBar(props: {
  children: ReactNode;
  resultLabel?: string;
}) {
  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-end gap-3">{props.children}</div>
      {props.resultLabel ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {props.resultLabel}
        </p>
      ) : null}
    </div>
  );
}

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  previousHref?: string | null;
  nextHref?: string | null;
  labels: { previous: string; next: string; page: string; of: string };
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]">
      <p>
        {props.labels.page} {props.page} {props.labels.of} {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {props.previousHref ? (
          <IconTextLink
            href={props.previousHref}
            variant="outline"
            icon={<ChevronLeft className="size-4" aria-hidden="true" />}
            label={props.labels.previous}
          />
        ) : (
          <IconTextButton
            type="button"
            variant="outline"
            disabled
            icon={<ChevronLeft className="size-4" aria-hidden="true" />}
            label={props.labels.previous}
          />
        )}
        {props.nextHref ? (
          <IconTextLink
            href={props.nextHref}
            icon={<ChevronRight className="size-4" aria-hidden="true" />}
            label={props.labels.next}
          />
        ) : (
          <IconTextButton
            type="button"
            disabled
            icon={<ChevronRight className="size-4" aria-hidden="true" />}
            label={props.labels.next}
          />
        )}
      </div>
    </div>
  );
}

export function DataTable(props: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)] md:block">
      <Table>
        <TableHeader>
          <TableRow>
            {props.headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{props.children}</TableBody>
      </Table>
    </div>
  );
}

export function MobileRecordCard(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[var(--foreground)]">{props.title}</div>
          {props.subtitle ? (
            <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {props.subtitle}
            </div>
          ) : null}
        </div>
        {props.status ? (
          <div className="shrink-0 self-start">{props.status}</div>
        ) : null}
      </div>
      {props.meta || props.actions ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {props.meta ? (
            <div className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {props.meta}
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {props.actions ? (
            <div className="shrink-0">{props.actions}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onCancel();
      }}
    >
      <Card className="w-full max-w-md">
        <CardContent className="pt-4 sm:pt-5">
          <h3 id="confirm-title" className="text-lg font-semibold text-[var(--foreground)]">
            {props.title}
          </h3>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{props.body}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={props.onCancel}>
              {props.cancelLabel}
            </Button>
            <Button
              type="button"
              variant={props.danger ? "destructive" : "default"}
              onClick={props.onConfirm}
            >
              {props.confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function DetailList(props: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {props.items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-[var(--muted-foreground)]">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-[var(--foreground)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActivityList(props: {
  items: Array<{
    id: string;
    title: string;
    meta?: string;
    when?: string;
  }>;
  empty?: ReactNode;
}) {
  if (props.items.length === 0) {
    return <>{props.empty}</>;
  }
  return (
    <ul className="relative space-y-0 pl-1">
      {props.items.map((item, index) => (
        <li
          key={item.id}
          className="group relative flex gap-3 rounded-[var(--radius-md)] py-3 pl-2 pr-1 transition hover:bg-[var(--muted)]/60"
        >
          <div className="relative flex w-5 shrink-0 flex-col items-center">
            <span
              className="z-[1] mt-1 inline-flex size-2.5 rounded-full bg-[var(--primary)] ring-4 ring-[var(--primary-soft)]"
              aria-hidden="true"
            />
            {index < props.items.length - 1 ? (
              <span
                className="absolute top-4 bottom-[-0.75rem] w-px bg-[var(--border)]"
                aria-hidden="true"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--foreground)]">{item.title}</p>
                {item.meta ? (
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {item.meta}
                  </p>
                ) : null}
              </div>
              {item.when ? (
                <time className="shrink-0 text-xs text-[var(--muted-foreground)]">
                  {item.when}
                </time>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

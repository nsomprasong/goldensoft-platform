import type { ReactNode } from "react";

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

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  info: "bg-[var(--info-soft)] text-[var(--info)]",
  pending: "bg-[var(--primary-soft)] text-[var(--primary)]",
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
    <header className="page-header mb-5 overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-sm)]">
      <div className="page-header-content">
        <div className="flex min-w-0 flex-1 gap-3">
          {props.icon ? (
            <div
              className="page-header-icon inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] shadow-[var(--shadow-sm)]"
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
              <div className="mb-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {props.breadcrumb}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)] text-[var(--text-primary)]">
                {props.title}
              </h1>
              {props.status}
            </div>
            {props.description ? (
              <p className="mt-1 max-w-2xl text-[length:var(--text-helper)] leading-[var(--leading-relaxed)] text-[var(--text-secondary)]">
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
          <h2 className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
            {props.title}
          </h2>
          {props.badge}
        </div>
        {props.description ? (
          <p className="mt-0.5 text-[length:var(--text-helper)] text-[var(--text-muted)]">
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
          <p className="text-[length:var(--text-caption)] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {props.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {props.value}
          </p>
          {props.hint ? (
            <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
              {props.hint}
            </p>
          ) : null}
        </div>
        {props.icon ? (
          <span
            className={`stat-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${accent.icon}`}
            aria-hidden="true"
          >
            {props.icon}
          </span>
        ) : null}
      </div>
    </>
  );
  const className = [
    "stat-card",
    accent.card,
  ].join(" ");
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
    <div
      className="card text-[length:var(--text-helper)] text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/40 px-6 py-10 text-center">
      <p className="font-medium text-[var(--text-primary)]">{props.title}</p>
      {props.body ? (
        <p className="mx-auto mt-1 max-w-md text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {props.body}
        </p>
      ) : null}
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}

export function AccessDenied(props: { title: string; body: string }) {
  return (
    <section className="alert-danger card" role="alert">
      <h2 className="text-lg font-semibold text-[var(--danger)]">{props.title}</h2>
      <p className="mt-2 text-[length:var(--text-helper)] text-[var(--danger)]">{props.body}</p>
    </section>
  );
}

export function ErrorState(props: { title: string; body?: string }) {
  return (
    <section className="alert-danger card" role="alert">
      <h2 className="font-semibold text-[var(--danger)]">{props.title}</h2>
      {props.body ? (
        <p className="mt-1 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {props.body}
        </p>
      ) : null}
    </section>
  );
}

export function StatusBadge(props: {
  label: string;
  code?: string;
  tone?: StatusTone;
}) {
  const tone = props.tone ?? statusToneForCode(props.code);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--text-caption)] font-semibold ${TONE_CLASS[tone]}`}
    >
      {props.label}
    </span>
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
    <div className="block text-[length:var(--text-label)]">
      <label htmlFor={props.htmlFor} className="mb-1.5 block font-medium text-[var(--text-primary)]">
        {props.label}
        {props.required ? (
          <span className="text-[var(--danger)]" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {props.children}
      {props.hint && !props.error ? (
        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{props.hint}</p>
      ) : null}
      {props.error ? (
        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--danger)]" role="alert">
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
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-end gap-3">{props.children}</div>
      {props.resultLabel ? (
        <p className="mt-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
      <p>
        {props.labels.page} {props.page} {props.labels.of} {totalPages}
      </p>
      <div className="flex gap-2">
        {props.previousHref ? (
          <a className="btn btn-secondary" href={props.previousHref}>
            {props.labels.previous}
          </a>
        ) : (
          <span className="btn btn-secondary opacity-50">{props.labels.previous}</span>
        )}
        {props.nextHref ? (
          <a className="btn" href={props.nextHref}>
            {props.labels.next}
          </a>
        ) : (
          <span className="btn opacity-50">{props.labels.next}</span>
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
    <div className="hidden overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] md:block">
      <table className="min-w-full text-left text-[length:var(--text-label)]">
        <thead className="bg-[var(--surface-muted)]">
          <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
            {props.headers.map((h) => (
              <th key={h} className="px-3 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[var(--surface)]">{props.children}</tbody>
      </table>
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
    <li className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--text-primary)]">{props.title}</div>
          {props.subtitle ? (
            <div className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {props.subtitle}
            </div>
          ) : null}
        </div>
        {props.status}
      </div>
      {props.meta ? (
        <div className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {props.meta}
        </div>
      ) : null}
      {props.actions ? <div className="mt-3 flex flex-wrap gap-2">{props.actions}</div> : null}
    </li>
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
      <div className="card w-full max-w-md">
        <h3 id="confirm-title" className="text-lg font-semibold">
          {props.title}
        </h3>
        <p className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {props.body}
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
          <button
            type="button"
            className={props.danger ? "btn btn-danger" : "btn"}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
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
          <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-[length:var(--text-label)] text-[var(--text-primary)]">
            {item.value}
          </dd>
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
          className="group relative flex gap-3 rounded-[var(--radius-md)] py-3 pl-2 pr-1 transition hover:bg-[var(--surface-muted)]/60"
        >
          <div className="relative flex w-5 shrink-0 flex-col items-center">
            <span
              className="z-[1] mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[var(--primary)] ring-4 ring-[var(--primary-soft)]"
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
                <p className="font-medium text-[var(--text-primary)]">{item.title}</p>
                {item.meta ? (
                  <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {item.meta}
                  </p>
                ) : null}
              </div>
              {item.when ? (
                <time className="shrink-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
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

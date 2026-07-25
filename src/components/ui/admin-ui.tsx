import type { ReactNode } from "react";

export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-sm text-slate-600">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? <div className="flex flex-wrap gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "กำลังโหลดข้อมูล..." }: { label?: string }) {
  return (
    <div className="card text-sm text-slate-600" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function EmptyState(props: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
      <p className="font-medium">{props.title}</p>
      {props.body ? <p className="mt-1 text-sm text-slate-600">{props.body}</p> : null}
    </div>
  );
}

export function AccessDenied(props: { title: string; body: string }) {
  return (
    <section className="card border-red-200 bg-red-50">
      <h2 className="text-lg font-semibold text-red-800">{props.title}</h2>
      <p className="mt-2 text-sm text-red-700">{props.body}</p>
    </section>
  );
}

export function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-[var(--background)] px-2.5 py-0.5 text-xs font-semibold">
      {label}
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
    <label className="block text-sm" htmlFor={props.htmlFor}>
      <span className="mb-1 block font-medium">
        {props.label}
        {props.required ? <span className="text-red-600"> *</span> : null}
      </span>
      {props.children}
      {props.hint ? <span className="mt-1 block text-xs text-slate-500">{props.hint}</span> : null}
      {props.error ? (
        <span className="mt-1 block text-xs text-red-600">{props.error}</span>
      ) : null}
    </label>
  );
}

export function SearchFilterBar(props: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-white p-3">
      {props.children}
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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p>
        {props.labels.page} {props.page} {props.labels.of} {totalPages}
      </p>
      <div className="flex gap-2">
        {props.previousHref ? (
          <a className="btn !bg-slate-600" href={props.previousHref}>
            {props.labels.previous}
          </a>
        ) : (
          <span className="btn !bg-slate-300 !text-slate-600">{props.labels.previous}</span>
        )}
        {props.nextHref ? (
          <a className="btn" href={props.nextHref}>
            {props.labels.next}
          </a>
        ) : (
          <span className="btn !bg-slate-300 !text-slate-600">{props.labels.next}</span>
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
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-slate-500">
            {props.headers.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="card max-w-md w-full">
        <h3 id="confirm-title" className="text-lg font-semibold">
          {props.title}
        </h3>
        <p className="mt-2 text-sm text-slate-600">{props.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn !bg-slate-600" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
          <button type="button" className="btn" onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

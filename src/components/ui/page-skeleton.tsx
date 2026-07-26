import { TH } from "@/lib/i18n/th";

export function PageSkeleton({
  statCount = 0,
  rowCount = 5,
}: {
  statCount?: number;
  rowCount?: number;
}) {
  return (
    <div className="page-container route-loading" role="status" aria-live="polite">
      <span className="sr-only">{TH.common.loading}</span>

      <div className="route-loading-hero">
        <div className="route-loading-mark" aria-hidden="true">
          <span className="route-loading-orb route-loading-orb--a" />
          <span className="route-loading-orb route-loading-orb--b" />
          <span className="route-loading-core">GS</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="skeleton-block mb-2 h-5 w-40 max-w-full rounded-full" />
          <div className="skeleton-block h-3.5 w-56 max-w-[80%] rounded-full" />
        </div>
      </div>

      {statCount > 0 ? (
        <div className="dashboard-summary">
          <div className="dashboard-stat-grid">
            {Array.from({ length: statCount }).map((_, index) => (
              <div
                key={index}
                className="skeleton-block h-[6.25rem] rounded-[var(--radius-lg)]"
                style={{ animationDelay: `${index * 90}ms` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="card mt-5 grid gap-3">
        {Array.from({ length: rowCount }).map((_, index) => (
          <div
            key={index}
            className="skeleton-block h-12 rounded-[var(--radius-md)]"
            style={{ animationDelay: `${120 + index * 70}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

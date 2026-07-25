export function PageSkeleton({
  statCount = 0,
  rowCount = 5,
}: {
  statCount?: number;
  rowCount?: number;
}) {
  return (
    <div className="page-container" role="status" aria-live="polite">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
      <div className="skeleton-block mb-5 h-24 rounded-[var(--radius-lg)]" />
      {statCount > 0 ? (
        <div className="dashboard-summary">
          <div className="dashboard-stat-grid">
            {Array.from({ length: statCount }).map((_, index) => (
              <div
                key={index}
                className="skeleton-block h-[6.25rem] rounded-[var(--radius-lg)]"
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
          />
        ))}
      </div>
    </div>
  );
}

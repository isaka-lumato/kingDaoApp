/**
 * Consignments list loading skeleton — mimics the table layout with
 * filter bar, rows, and pagination.
 */
export default function ConsignmentsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header + filters */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 bg-muted rounded-lg" />
          <div className="h-4 w-48 bg-muted/60 rounded mt-2" />
        </div>
        <div className="h-9 w-20 bg-muted rounded-lg" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-3">
        <div className="h-9 w-32 bg-muted/40 rounded-lg" />
        <div className="h-9 w-32 bg-muted/40 rounded-lg" />
        <div className="h-9 flex-1 max-w-xs bg-muted/40 rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/20">
          {[80, 48, 120, 96, 64, 72, 56].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-muted/50 rounded"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>

        {/* Table rows */}
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0"
          >
            <div className="h-4 w-20 bg-muted/30 rounded" />
            <div className="h-4 w-12 bg-muted/30 rounded" />
            <div className="h-4 w-28 bg-muted/30 rounded" />
            <div className="h-4 w-24 bg-muted/20 rounded" />
            <div className="h-4 w-16 bg-muted/30 rounded" />
            <div className="h-5 w-16 bg-muted/20 rounded-full" />
            <div className="h-4 w-14 bg-muted/30 rounded" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 bg-muted/40 rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-muted/40 rounded-lg" />
          <div className="h-8 w-20 bg-muted/40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

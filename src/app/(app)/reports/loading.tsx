/**
 * Reports page loading skeleton — mimics filter bar + report table.
 */
export default function ReportsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-28 bg-muted rounded-lg" />
          <div className="h-4 w-52 bg-muted/60 rounded mt-2" />
        </div>
        <div className="h-9 w-28 bg-muted rounded-lg" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-36 bg-muted/40 rounded-lg" />
        <div className="h-9 w-36 bg-muted/40 rounded-lg" />
        <div className="h-9 w-28 bg-muted/40 rounded-lg" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/20">
          {[80, 120, 64, 96, 72, 56].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-muted/50 rounded"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0"
          >
            <div className="h-4 w-20 bg-muted/30 rounded" />
            <div className="h-4 w-28 bg-muted/30 rounded" />
            <div className="h-4 w-16 bg-muted/20 rounded" />
            <div className="h-4 w-24 bg-muted/30 rounded" />
            <div className="h-4 w-16 bg-muted/20 rounded" />
            <div className="h-4 w-14 bg-muted/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

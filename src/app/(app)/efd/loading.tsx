/**
 * EFD Records loading skeleton — mimics a list/table layout.
 */
export default function EfdLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-36 bg-muted rounded-lg" />
          <div className="h-4 w-44 bg-muted/60 rounded mt-2" />
        </div>
        <div className="h-9 w-20 bg-muted rounded-lg" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="h-9 w-32 bg-muted/40 rounded-lg" />
        <div className="h-9 flex-1 max-w-xs bg-muted/40 rounded-lg" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/20">
          {[72, 96, 64, 80, 56].map((w, i) => (
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
            <div className="h-4 w-24 bg-muted/30 rounded" />
            <div className="h-4 w-16 bg-muted/20 rounded" />
            <div className="h-5 w-14 bg-muted/20 rounded-full" />
            <div className="h-4 w-14 bg-muted/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

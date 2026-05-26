/**
 * Consignment detail loading skeleton — mimics the detail card layout
 * with header, info grid, pipeline stages, and audit log.
 */
export default function ConsignmentDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Back link + header */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 bg-muted/40 rounded" />
        <div className="h-4 w-24 bg-muted/40 rounded" />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded-lg" />
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-muted/40 rounded-full" />
            <div className="h-5 w-28 bg-muted/40 rounded-full" />
          </div>
        </div>
        <div className="h-9 w-20 bg-muted rounded-lg" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-16 bg-muted/40 rounded" />
            <div className="h-5 w-28 bg-muted/60 rounded" />
          </div>
        ))}
      </div>

      {/* Pipeline stages */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-36 bg-muted rounded" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="h-3 w-20 bg-muted/40 rounded" />
              <div className="h-6 w-16 bg-muted/60 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Audit log */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="h-5 w-24 bg-muted rounded" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-b-0"
          >
            <div className="h-3 w-24 bg-muted/30 rounded" />
            <div className="h-3 w-32 bg-muted/30 rounded" />
            <div className="h-3 w-20 bg-muted/20 rounded" />
            <div className="h-3 w-20 bg-muted/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Import page loading skeleton.
 */
export default function ImportLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div>
        <div className="h-7 w-28 bg-muted rounded-lg" />
        <div className="h-4 w-56 bg-muted/60 rounded mt-2" />
      </div>

      {/* Upload area */}
      <div className="rounded-xl border-2 border-dashed border-border bg-muted/10 flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-12 h-12 bg-muted/40 rounded-full" />
        <div className="h-4 w-48 bg-muted/40 rounded" />
        <div className="h-3 w-32 bg-muted/30 rounded" />
      </div>

      {/* Preview table */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-muted/20 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

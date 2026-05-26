/**
 * Dashboard loading skeleton — mimics the KPI cards + funnel + lists layout.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div>
        <div className="h-7 w-36 bg-muted rounded-lg" />
        <div className="h-4 w-56 bg-muted/60 rounded mt-2" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border p-4 space-y-2"
          >
            <div className="h-3 w-20 bg-muted/60 rounded" />
            <div className="h-8 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Funnel + top clients */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="h-4 w-32 bg-muted rounded" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-20 bg-muted/40 rounded" />
              <div className="flex-1 h-6 bg-muted/30 rounded" />
              <div className="h-3 w-8 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="h-4 w-28 bg-muted rounded" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-5 bg-muted/40 rounded" />
              <div className="flex-1 h-4 bg-muted/30 rounded" />
              <div className="h-4 w-10 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border flex justify-between">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted/40 rounded" />
            </div>
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-12 h-12 bg-muted/30 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 bg-muted/40 rounded" />
                    <div className="h-3 w-48 bg-muted/30 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

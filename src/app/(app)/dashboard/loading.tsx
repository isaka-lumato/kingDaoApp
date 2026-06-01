/**
 * Dashboard loading skeleton — mimics the KPI cards + funnel + lists layout.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-8">
      {/* Header */}
      <div>
        <div className="h-7 w-36 rounded-lg bg-muted" />
        <div className="mt-2 h-4 w-56 rounded bg-muted/60" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-border bg-card p-5"
          >
            <div className="h-3 w-24 rounded bg-muted/60" />
            <div className="h-7 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Funnel + top clients */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <div className="h-4 w-32 rounded bg-muted" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-20 rounded bg-muted/40" />
              <div className="h-5 flex-1 rounded-md bg-muted/30" />
              <div className="h-3 w-8 rounded bg-muted/40" />
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="h-4 w-28 rounded bg-muted" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-5 rounded bg-muted/40" />
              <div className="h-4 flex-1 rounded bg-muted/30" />
              <div className="h-4 w-10 rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex justify-between px-6 pt-5 pb-4">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted/40" />
            </div>
            <div className="divide-y divide-border border-t border-border">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-6 py-3">
                  <div className="h-9 w-9 rounded-full bg-muted/30" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 rounded bg-muted/40" />
                    <div className="h-3 w-48 rounded bg-muted/30" />
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

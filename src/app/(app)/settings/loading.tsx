/**
 * Settings page loading skeleton — mimics tab navigation + settings form.
 */
export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div>
        <div className="h-7 w-28 bg-muted rounded-lg" />
        <div className="h-4 w-48 bg-muted/60 rounded mt-2" />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border pb-px">
        <div className="h-9 w-20 bg-muted/40 rounded-t-lg" />
        <div className="h-9 w-20 bg-muted/20 rounded-t-lg" />
      </div>

      {/* Settings content */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="space-y-1.5">
              <div className="h-4 w-32 bg-muted/40 rounded" />
              <div className="h-3 w-56 bg-muted/20 rounded" />
            </div>
            <div className="h-8 w-24 bg-muted/30 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

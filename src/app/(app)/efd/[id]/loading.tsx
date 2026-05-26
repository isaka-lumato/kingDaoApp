export default function EfdDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 bg-muted/40 rounded" />
        <div className="h-4 w-32 bg-muted/40 rounded" />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-muted rounded-lg" />
          <div className="flex gap-2">
            <div className="h-5 w-16 bg-muted/40 rounded-full" />
            <div className="h-5 w-20 bg-muted/40 rounded-full" />
          </div>
        </div>
        <div className="h-9 w-24 bg-muted/40 rounded-lg" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 bg-muted/40 rounded" />
              <div className="h-10 bg-muted/30 rounded-lg" />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="h-3 w-20 bg-muted/40 rounded" />
          <div className="h-20 bg-muted/30 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-8 w-28 bg-muted/40 rounded-lg" />
        </div>
        <div className="divide-y divide-border">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-4 w-20 bg-muted/30 rounded" />
              <div className="h-4 w-12 bg-muted/30 rounded" />
              <div className="h-4 w-32 bg-muted/30 rounded" />
              <div className="h-5 w-16 bg-muted/20 rounded-full" />
              <div className="h-4 w-4 bg-muted/30 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RolesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-24 bg-muted rounded-lg" />
          <div className="h-4 w-64 bg-muted/60 rounded mt-2" />
        </div>
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-28 bg-muted rounded" />
              <div className="h-5 w-14 bg-muted/30 rounded-full" />
            </div>
            <div className="h-3 w-full bg-muted/30 rounded" />
            <div className="h-3 w-2/3 bg-muted/30 rounded" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 w-20 bg-muted/40 rounded-lg" />
              <div className="h-8 w-20 bg-muted/40 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

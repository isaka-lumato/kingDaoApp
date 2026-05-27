export default function NewEfdLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 bg-muted/40 rounded" />
        <div className="h-4 w-32 bg-muted/40 rounded" />
      </div>

      <div>
        <div className="h-7 w-52 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted/60 rounded mt-2" />
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

        <div className="space-y-2">
          <div className="h-3 w-40 bg-muted/40 rounded" />
          <div className="h-10 bg-muted/30 rounded-lg" />
          <div className="rounded-lg border border-border bg-muted/10 divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-4 w-4 bg-muted/40 rounded" />
                <div className="h-4 w-20 bg-muted/40 rounded" />
                <div className="h-4 w-32 bg-muted/30 rounded" />
                <div className="h-5 w-16 bg-muted/20 rounded-full ml-auto" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <div className="h-10 w-24 bg-muted/40 rounded-lg" />
          <div className="h-10 w-36 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}

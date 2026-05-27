/**
 * Root (app) loading skeleton — shown instantly on navigation while
 * server components fetch data. Prevents the frozen-screen feeling.
 */
export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-44 bg-muted rounded-lg" />
          <div className="h-4 w-64 bg-muted/60 rounded mt-2" />
        </div>
        <div className="h-9 w-24 bg-muted rounded-lg" />
      </div>

      {/* Content area skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-48 bg-muted/40 rounded-xl border border-border" />
        <div className="h-48 bg-muted/40 rounded-xl border border-border" />
        <div className="h-48 bg-muted/40 rounded-xl border border-border" />
      </div>

      <div className="h-64 bg-muted/40 rounded-xl border border-border" />
    </div>
  );
}

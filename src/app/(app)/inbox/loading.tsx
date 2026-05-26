/**
 * Inbox loading skeleton — mimics a notification/task list layout.
 */
export default function InboxLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header */}
      <div>
        <div className="h-7 w-24 bg-muted rounded-lg" />
        <div className="h-4 w-48 bg-muted/60 rounded mt-2" />
      </div>

      {/* Inbox items */}
      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-4">
            <div className="w-10 h-10 bg-muted/30 rounded-full shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-24 bg-muted/40 rounded" />
                <div className="h-3 w-16 bg-muted/30 rounded" />
              </div>
              <div className="h-3 w-3/4 bg-muted/30 rounded" />
              <div className="h-3 w-1/2 bg-muted/20 rounded" />
            </div>
            <div className="h-5 w-16 bg-muted/20 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

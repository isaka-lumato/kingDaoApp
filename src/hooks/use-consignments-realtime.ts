"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Subscribe to live `consignments` changes and reflect them in the UI without
 * a refetch storm (D-057, CLAUDE.md §3.7).
 *
 * For the cache-backed list (D-056) the right "merge" is to invalidate the
 * consignments queries: a single change can move a row across pages/filters,
 * so a targeted `setQueryData` row-patch would be wrong for most cached keys.
 * Invalidation lets TanStack Query refetch only the *active* keys (others stay
 * stale until revisited) — cheap, and always correct. The query's `staleTime`
 * (30s) plus this signal keeps every open list current.
 *
 * `onChange` is an escape hatch for views that aren't query-backed (the kanban
 * board is RSC-props + useOptimistic): they pass a callback — typically a
 * debounced `router.refresh()` — to pick up other users' changes live.
 *
 * One channel per mount, torn down on unmount. RLS is respected server-side,
 * so we only receive events for rows this user can already read.
 */
export function useConsignmentsRealtime(onChange?: () => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("consignments-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consignments" },
        () => {
          // Refetch only the currently-mounted consignments queries.
          queryClient.invalidateQueries({ queryKey: queryKeys.consignments.all });
          onChange?.();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryClient is stable; onChange is expected to be stable (useCallback) or
    // cheap to re-subscribe on. Re-running on onChange identity change is fine.
  }, [queryClient, onChange]);
}

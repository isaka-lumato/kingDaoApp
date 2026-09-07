"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

/**
 * Returns a callback that marks every cached consignments query stale (D-072).
 *
 * Since the `/consignments` grid reads through the TanStack cache,
 * `revalidatePath("/consignments")` in a server action no longer refreshes the
 * grid for the user who made the change: `initialData` only seeds a key that
 * has no cache entry yet, so a previously-visited view keeps serving its cached
 * rows. Realtime (`use-consignments-realtime.ts`) covers *other* users, but it
 * only fires while a subscribed view is mounted — the actor sitting on a form or
 * the detail page has no subscription, so their own edit would be invisible for
 * up to `staleTime` (30s) on their next visit to the list.
 *
 * Every client-side consignment mutation therefore calls this. Note it targets
 * `queryKeys.consignments.all`, so list, detail and pipeline keys are all
 * covered by the one call.
 *
 * `invalidateQueries` defaults to `refetchType: "active"`: mounted queries
 * refetch immediately, unmounted ones are only flagged stale and refetch when
 * next mounted. That is what makes it safe to call this *before* awaiting a
 * mutation from a screen where the grid isn't mounted (the redirect-based
 * forms) — nothing refetches early and re-caches pre-mutation rows.
 */
export function useInvalidateConsignments(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.consignments.all,
    });
  }, [queryClient]);
}

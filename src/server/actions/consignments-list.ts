"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { perfTimer } from "@/lib/perf";
import {
  LIST_PAGE_SIZE,
  type ConsignmentListPage,
  type ConsignmentListRow,
  type ListView,
} from "@/lib/consignments-list";
import { resolvePrereqs, buildListQuery } from "@/server/consignments/list-query";

/**
 * Shared `queryFn` for the `/consignments` grid (D-065 step 4).
 *
 * The page's server component calls this for its first render (seeding
 * TanStack Query via `initialData`) and the client grid calls it directly for
 * every subsequent filter/sort/page change. One code path means the SSR frame
 * and every cached refetch apply byte-identical filtering.
 *
 * Being a server action, this is a callable endpoint in its own right — hence
 * the explicit `getServerPermissions()` gate, mirroring the export route
 * (`/api/consignments/export/[format]`). Row-level access is still enforced by
 * RLS through the user-bound client (D-026); the gate just rejects anonymous
 * callers before we spend a round-trip.
 *
 * Errors are returned in-band (`{ rows: [], total: 0, error }`) rather than
 * thrown, so a failed refetch renders the grid's existing error banner instead
 * of tripping an error boundary and blanking the screen.
 */
export async function listConsignmentsAction(
  view: ListView,
): Promise<ConsignmentListPage> {
  const perms = await getServerPermissions();
  if (!perms) {
    return { rows: [], total: 0, error: "Not authenticated" };
  }

  const t = perfTimer("consignments-list");
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  const page = Math.max(1, Math.trunc(view.page) || 1);
  const from = (page - 1) * LIST_PAGE_SIZE;

  // Prerequisite lookups (stuck-stage ids, client-name search ids) — D-042.
  const prereqs = await resolvePrereqs(supabase, view);
  t.mark("prereqs");

  type RawRow = Omit<ConsignmentListRow, "clients"> & {
    clients:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  };

  const { data, count, error } = (await buildListQuery(
    supabase,
    view,
    prereqs,
  ).range(from, from + LIST_PAGE_SIZE - 1)) as {
    data: RawRow[] | null;
    count: number | null;
    error: { message: string } | null;
  };
  t.mark("query");

  // PostgREST returns the `clients` join as an array — normalize to one object.
  const rows: ConsignmentListRow[] = (data ?? []).map((row) => ({
    ...row,
    clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
  }));

  t.end({
    rows: rows.length,
    total: count ?? 0,
    stageFilter: view.stage ?? "none",
  });

  return {
    rows,
    total: count ?? 0,
    error: error?.message,
  };
}

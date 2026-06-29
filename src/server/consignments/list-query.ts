import "server-only";

import type { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  SORTABLE_COLUMNS,
  SEARCH_COLUMNS,
  sanitizeSearch,
  type ListParams,
} from "@/lib/consignments-list";

/**
 * Shared Supabase query layer for the `/consignments` list. The page
 * (`src/app/(app)/consignments/page.tsx`) and the export route
 * (`src/app/api/consignments/export/[format]/route.ts`) both build their query
 * through here so the on-screen grid and the downloaded file apply byte-
 * identical filtering — only pagination differs (the page adds `.range()`,
 * the export does not).
 *
 * Pure params (sort allowlist, search columns, `parseListParams`) live in
 * `@/lib/consignments-list` so the client grid can import them without crossing
 * this `server-only` barrier.
 *
 * D-026: every read uses the user-bound server client the caller passes in.
 */

// Re-export the pure params so server callers have a single import site.
export {
  SORTABLE_COLUMNS,
  parseListParams,
  type ListParams,
  type SortKey,
  type SortDir,
} from "@/lib/consignments-list";

type Sb = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/** The exact column set the list grid + exports read. */
export const CONSIGNMENT_SELECT = `id, ref_no, year, serial_no, tansad_no, bl_number, client_id,
   cargo_count, cargo_type, efd_receipt_no, goods_description, vessel_name,
   arrival_date, amount, release_status, release_date,
   manifest_status, shipping_batch_status, tanesws_status,
   assessment_status, tbs_loading_status, tbs_debit_status,
   manifest_comp_status, duty_status, inspection_file_status,
   updated_at, created_at,
   clients(id, name)`;

export type ListPrereqs = {
  /**
   * When `stage==="stuck"`: the consignment ids from `v_stuck_stages`.
   * `null` means "no id restriction"; `[]` means "force zero rows".
   */
  stuckIds: string[] | null;
  /** Client ids whose name matches `q` — folds client-name into the search. */
  searchClientIds: string[];
};

/**
 * Run the lookups the main grid query depends on (stuck-stage ids + client-name
 * search ids) in parallel. The page runs this inside its tier-1 `Promise.all`
 * alongside the clients-dropdown query (D-042), so it adds no extra round-trip.
 */
export async function resolvePrereqs(
  supabase: Sb,
  params: ListParams,
): Promise<ListPrereqs> {
  const wantStuck = params.stage === "stuck";
  const cleaned = params.q ? sanitizeSearch(params.q) : "";

  const [stuckRes, clientRes] = await Promise.all([
    wantStuck
      ? supabase.from("v_stuck_stages").select("consignment_id")
      : Promise.resolve({
          data: null as { consignment_id: string | null }[] | null,
        }),
    cleaned
      ? supabase
          .from("clients")
          .select("id")
          .is("deleted_at", null)
          .ilike("name", `%${cleaned}%`)
      : Promise.resolve({ data: null as { id: string }[] | null }),
  ]);

  const stuckIds = wantStuck
    ? (Array.from(
        new Set(
          (stuckRes.data ?? []).map((r) => r.consignment_id).filter(Boolean),
        ),
      ) as string[])
    : null;

  const searchClientIds = ((clientRes.data ?? []) as { id: string }[]).map(
    (r) => r.id,
  );

  return { stuckIds, searchClientIds };
}

/**
 * Build the consignments list query: select + count, year/soft-delete/client/
 * stage filters, the multi-field search, and allowlisted sort with a stable
 * `id` tiebreaker. The caller is responsible for `.range()` (page) or leaving
 * it unbounded (export).
 */
export function buildListQuery(
  supabase: Sb,
  params: ListParams,
  prereqs: ListPrereqs,
) {
  let q = supabase
    .from("consignments")
    .select(CONSIGNMENT_SELECT, { count: "exact" })
    .eq("year", params.year)
    .is("deleted_at", null);

  if (params.client) q = q.eq("client_id", params.client);
  if (params.stage === "unreleased") q = q.neq("release_status", "Released");

  if (prereqs.stuckIds !== null) {
    if (prereqs.stuckIds.length === 0) {
      // Empty set → force zero rows without an invalid `.in("id", [])`.
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      q = q.in("id", prereqs.stuckIds);
    }
  }

  if (params.q) {
    const cleaned = sanitizeSearch(params.q);
    if (cleaned) {
      const terms = SEARCH_COLUMNS.map((c) => `${c}.ilike.*${cleaned}*`);
      if (prereqs.searchClientIds.length > 0) {
        terms.push(`client_id.in.(${prereqs.searchClientIds.join(",")})`);
      }
      q = q.or(terms.join(","));
    }
  }

  const column = SORTABLE_COLUMNS[params.sort];
  q = q
    .order(column, { ascending: params.dir === "asc" })
    .order("id", { ascending: true });

  return q;
}

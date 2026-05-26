import type { Metadata } from "next";
import { Suspense } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { perfTimer } from "@/lib/perf";
import ConsignmentsClient from "./consignments-client";
import BatchPanel from "./_batch-panel/batch-panel";
import BatchPanelContent from "./_batch-panel/batch-panel-content";

export const metadata: Metadata = { title: "Consignments — KDL Tracker" };

export default async function ConsignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    client?: string;
    stage?: string;
    q?: string;
    page?: string;
    batch?: string;
    bc?: string;
    by?: string;
  }>;
}) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const page = params.page ? parseInt(params.page, 10) : 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;

  const t = perfTimer("consignments-list");
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  // Build the consignments query (D-042: launched in parallel with the
  // clients dropdown query, since they're fully independent).
  function buildConsignmentsQuery(stuckIds: string[] | null) {
    let q = supabase
      .from("consignments")
      .select(
        `id, ref_no, year, serial_no, tansad_no, bl_number, in_ref, client_id,
         container_count, container_type, goods_description, vessel_name,
         arrival_date, amount, release_status, release_date,
         manifest_status, shipping_batch_status, tanesws_status,
         assessment_status, tbs_loading_status, tbs_debit_status,
         manifest_comp_status, duty_status, inspection_file_status,
         updated_at, created_at,
         clients(id, name)`,
        { count: "exact" }
      )
      .eq("year", year)
      .is("deleted_at", null)
      .order("serial_no", { ascending: true })
      .range(from, from + pageSize - 1);

    if (params.client) q = q.eq("client_id", params.client);
    if (params.stage === "unreleased") q = q.neq("release_status", "Released");
    if (stuckIds !== null) {
      // Empty set → force zero results without an invalid `.in("id", [])`.
      if (stuckIds.length === 0) {
        q = q.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        q = q.in("id", stuckIds);
      }
    }
    if (params.q) q = q.ilike("ref_no", `%${params.q}%`);
    return q;
  }

  // Tier 1: always fetch the clients dropdown in parallel with whatever
  // upstream query the main grid needs. When stage=stuck we also need the
  // v_stuck_stages IDs to filter the main grid — fetch those here too.
  //
  // Non-stuck case: clients-dropdown + main consignments query run as one
  // parallel batch (the 368ms + 312ms serial chain collapses to ~370ms).
  //
  // Stuck case: clients-dropdown + v_stuck_stages run in parallel (tier 1),
  // then the main consignments query fires with the resolved IDs (tier 2).
  // Two tiers instead of three.
  const isStuck = params.stage === "stuck";

  const tier1 = isStuck
    ? Promise.all([
        supabase
          .from("clients")
          .select("id, name")
          .is("deleted_at", null)
          .order("name"),
        supabase.from("v_stuck_stages").select("consignment_id"),
      ])
    : Promise.all([
        supabase
          .from("clients")
          .select("id, name")
          .is("deleted_at", null)
          .order("name"),
        buildConsignmentsQuery(null),
      ]);

  // Row shape from `buildConsignmentsQuery` — the page only spreads each row
  // and reads `.clients`; downstream the array is cast to `any` at the JSX
  // boundary, matching the pre-D-042 typing.
  type ConsignmentRow = Record<string, unknown> & {
    clients: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  let clientsRes: { data: { id: string; name: string }[] | null };
  let mainRes: {
    data: ConsignmentRow[] | null;
    count: number | null;
    error: { message: string } | null;
  };

  if (isStuck) {
    const [c, stuckRows] = (await tier1) as [
      { data: { id: string; name: string }[] | null },
      { data: { consignment_id: string | null }[] | null },
    ];
    t.mark("tier1-clients+stuck");
    clientsRes = c;
    const stuckIds = Array.from(
      new Set((stuckRows.data ?? []).map((r) => r.consignment_id).filter(Boolean)),
    ) as string[];
    // Tier 2: main consignments query with the stuckIds filter applied.
    mainRes = (await buildConsignmentsQuery(stuckIds)) as typeof mainRes;
    t.mark("tier2-consignments");
  } else {
    const [c, m] = (await tier1) as [
      { data: { id: string; name: string }[] | null },
      typeof mainRes,
    ];
    t.mark("tier1-clients+consignments");
    clientsRes = c;
    mainRes = m;
  }

  const clients = clientsRes.data;
  const { data, count, error } = mainRes;

  // Supabase returns clients as an array from the join — normalize to single object
  const normalizedRows = (data ?? []).map((row) => ({
    ...row,
    clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
  }));

  const batchInRef = params.batch?.trim();
  const batchClientId = params.bc?.trim();
  const batchYear = params.by ? parseInt(params.by, 10) : NaN;
  const showBatch =
    !!batchInRef && !!batchClientId && Number.isFinite(batchYear);

  t.end({ rows: (data ?? []).length, total: count ?? 0, stageFilter: params.stage ?? "none" });

  return (
    <>
      <ConsignmentsClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows={normalizedRows as any}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        year={year}
        clients={clients ?? []}
        filters={{ client: params.client, stage: params.stage, q: params.q }}
        fetchError={error?.message}
      />
      {showBatch && (
        <BatchPanel inRef={batchInRef!}>
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground">Loading batch…</div>
            }
          >
            <BatchPanelContent
              inRef={batchInRef!}
              clientId={batchClientId!}
              year={batchYear}
            />
          </Suspense>
        </BatchPanel>
      )}
    </>
  );
}

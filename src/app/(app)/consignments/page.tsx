import type { Metadata } from "next";
import { Suspense } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();

  // Fetch clients for filter dropdown.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");

  // Build query.
  let query = supabase
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

  if (params.client) query = query.eq("client_id", params.client);
  if (params.stage === "unreleased") query = query.neq("release_status", "Done");
  if (params.stage === "stuck") query = query.eq("release_status", "Waiting");
  if (params.q) query = query.ilike("ref_no", `%${params.q}%`);

  const { data, count, error } = await query;

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

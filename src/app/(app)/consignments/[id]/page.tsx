import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { perfTimer } from "@/lib/perf";
import ConsignmentDetail from "./consignment-detail";
import BatchPanel from "../_batch-panel/batch-panel";
import BatchPanelContent from "../_batch-panel/batch-panel-content";

export const metadata: Metadata = { title: "Consignment — KDL Tracker" };

export default async function ConsignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ batch?: string; bc?: string; by?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // Validate UUID format to avoid passing junk to the DB.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) notFound();

  const t = perfTimer("consignment-detail");
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  // `deleted_at IS NULL` is now enforced both by the consignments_select RLS
  // policy and by the .is() filter below — defense in depth.
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  // Fetch main record — separate from joins to isolate any join error.
  const { data: consignment, error } = await supabase
    .from("consignments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  t.mark("consignment");

  if (error || !consignment) {
    console.error("[detail] consignment fetch error:", error?.message, "id:", id);
    t.end({ result: "not-found" });
    notFound();
  }

  // Fetch client, ICD, audit log, and EFD links in parallel — they only
  // depend on the consignment record, not on each other.
  const [
    { data: clientData },
    { data: icdData },
    { data: auditLog },
    { data: efdLinks },
  ] = await Promise.all([
    consignment.client_id
      ? supabase
          .from("clients")
          .select("id, name")
          .eq("id", consignment.client_id)
          .single()
      : Promise.resolve({ data: null }),
    consignment.icd_id
      ? supabase
          .from("icds")
          .select("id, name, location")
          .eq("id", consignment.icd_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("audit_log")
      .select("id, occurred_at, actor_email, column_name, old_value, new_value")
      .eq("row_id", id)
      .eq("table_name", "consignments")
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("efd_record_consignments")
      .select(
        `efd_record_id,
         efd_records(id, efd_code, efd_time, is_private, is_transit, is_shared, created_at)`
      )
      .eq("consignment_id", id),
  ]);
  t.mark("fanout");

  const linkedEfds = (efdLinks ?? [])
    .map((l) => {
      const raw = l.efd_records as unknown;
      const e = Array.isArray(raw)
        ? (raw[0] as Record<string, unknown> | undefined)
        : (raw as Record<string, unknown> | null);
      if (!e) return null;
      return {
        id: e.id as string,
        efd_code: e.efd_code as string,
        efd_time: (e.efd_time as string | null) ?? null,
        is_private: Boolean(e.is_private),
        is_transit: Boolean(e.is_transit),
        is_shared: Boolean(e.is_shared),
        created_at: e.created_at as string,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // GUTA pair sibling (T-052, PRD §8.15). The auto-pair trigger sets
  // `guta_pair_id` on both rows when the FRAMES/PARTS sibling is detected.
  let gutaPair: {
    batchCode: string;
    thisRole: "PARTS" | "FRAMES";
    sibling: {
      id: string;
      ref_no: string;
      bl_number: string | null;
      container_count: number | null;
      container_type: string | null;
      amount: number | null;
      release_status: string;
      release_date: string | null;
      goods_description: string | null;
    };
  } | null = null;

  if (consignment.guta_pair_id) {
    const { data: pair } = await supabase
      .from("guta_pairs")
      .select("id, batch_code, parts_consignment_id, frames_consignment_id")
      .eq("id", consignment.guta_pair_id)
      .single();

    if (pair) {
      const thisIsParts = pair.parts_consignment_id === id;
      const siblingId = thisIsParts
        ? pair.frames_consignment_id
        : pair.parts_consignment_id;
      const { data: sibling } = await supabase
        .from("consignments")
        .select(
          "id, ref_no, bl_number, container_count, container_type, amount, release_status, release_date, goods_description"
        )
        .eq("id", siblingId)
        .is("deleted_at", null)
        .single();

      if (sibling) {
        gutaPair = {
          batchCode: pair.batch_code,
          thisRole: thisIsParts ? "PARTS" : "FRAMES",
          sibling,
        };
      }
    }
  }

  if (consignment.guta_pair_id) t.mark("guta-pair");

  const batchInRef = sp.batch?.trim();
  const batchClientId = sp.bc?.trim();
  const batchYear = sp.by ? parseInt(sp.by, 10) : NaN;
  const showBatch =
    !!batchInRef && !!batchClientId && Number.isFinite(batchYear);

  t.end();

  return (
    <>
      <ConsignmentDetail
        consignment={{ ...consignment, clients: clientData, icds: icdData }}
        auditLog={auditLog ?? []}
        linkedEfds={linkedEfds}
        gutaPair={gutaPair}
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

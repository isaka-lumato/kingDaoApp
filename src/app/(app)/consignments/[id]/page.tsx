import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

  // Per T-048 / D-026: user-bound server client; RLS enforced.
  // `deleted_at IS NULL` is now enforced both by the consignments_select RLS
  // policy and by the .is() filter below — defense in depth.
  const supabase = await getSupabaseServerClient();

  // Fetch main record — separate from joins to isolate any join error.
  const { data: consignment, error } = await supabase
    .from("consignments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !consignment) {
    console.error("[detail] consignment fetch error:", error?.message, "id:", id);
    notFound();
  }

  // Fetch client separately.
  const { data: clientData } = consignment.client_id
    ? await supabase
        .from("clients")
        .select("id, name")
        .eq("id", consignment.client_id)
        .single()
    : { data: null };

  // Fetch ICD separately.
  const { data: icdData } = consignment.icd_id
    ? await supabase
        .from("icds")
        .select("id, name, location")
        .eq("id", consignment.icd_id)
        .single()
    : { data: null };

  // Fetch audit log.
  const { data: auditLog } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor_email, column_name, old_value, new_value")
    .eq("row_id", id)
    .eq("table_name", "consignments")
    .order("occurred_at", { ascending: false })
    .limit(50);

  // Fetch linked EFD records via the M:M join.
  const { data: efdLinks } = await supabase
    .from("efd_record_consignments")
    .select(
      `efd_record_id,
       efd_records(id, efd_code, efd_time, is_private, is_transit, is_shared, created_at)`
    )
    .eq("consignment_id", id);

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

  const batchInRef = sp.batch?.trim();
  const batchClientId = sp.bc?.trim();
  const batchYear = sp.by ? parseInt(sp.by, 10) : NaN;
  const showBatch =
    !!batchInRef && !!batchClientId && Number.isFinite(batchYear);

  return (
    <>
      <ConsignmentDetail
        consignment={{ ...consignment, clients: clientData, icds: icdData }}
        auditLog={auditLog ?? []}
        linkedEfds={linkedEfds}
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

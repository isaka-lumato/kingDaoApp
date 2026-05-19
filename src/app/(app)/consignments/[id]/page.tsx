import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import ConsignmentDetail from "./consignment-detail";

export const metadata: Metadata = { title: "Consignment — KDL Tracker" };

export default async function ConsignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Validate UUID format to avoid passing junk to the DB.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) notFound();

  const supabase = getSupabaseAdminClient();

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

  return (
    <ConsignmentDetail
      consignment={{ ...consignment, clients: clientData, icds: icdData }}
      auditLog={auditLog ?? []}
    />
  );
}

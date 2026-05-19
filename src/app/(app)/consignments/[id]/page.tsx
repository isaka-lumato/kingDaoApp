import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import ConsignmentDetail from "./consignment-detail";

export const metadata: Metadata = { title: "Consignment — KDL Tracker" };

export default async function ConsignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: consignment, error } = await supabase
    .from("consignments")
    .select(`*, clients(id, name), icds(id, name, code)`)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !consignment) notFound();

  const { data: auditLog } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor_email, column_name, old_value, new_value")
    .eq("row_id", id)
    .eq("table_name", "consignments")
    .order("occurred_at", { ascending: false })
    .limit(50);

  return (
    <ConsignmentDetail
      consignment={consignment}
      auditLog={auditLog ?? []}
    />
  );
}

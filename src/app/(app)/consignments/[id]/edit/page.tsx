import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { STAGE_FIELDS } from "@/lib/pipeline";
import EditConsignmentForm from "./edit-consignment-form";

export const metadata: Metadata = { title: "Edit Consignment — KDL Tracker" };

// All columns that could appear in the edit form.
const EDITABLE_COLS = [
  "ref_no", "year", "serial_no", "client_id", "icd_id",
  "bl_number", "tansad_no", "vessel_name", "arrival_date",
  "container_count", "container_type", "goods_description",
  "amount", "remarks",
  ...STAGE_FIELDS,
] as const;

export default async function EditConsignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();

  const { data: consignment, error } = await supabase
    .from("consignments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !consignment) notFound();

  // Fetch client and ICD separately (same pattern as detail page).
  const { data: clientData } = consignment.client_id
    ? await supabase.from("clients").select("id, name").eq("id", consignment.client_id).single()
    : { data: null };

  const { data: icdData } = consignment.icd_id
    ? await supabase.from("icds").select("id, name, location").eq("id", consignment.icd_id).single()
    : { data: null };

  const [{ data: clients }, { data: icds }, { data: vessels }] = await Promise.all([
    supabase.from("clients").select("id, name, sub_label").is("deleted_at", null).eq("is_active", true).order("name"),
    supabase.from("icds").select("id, name, location").is("deleted_at", null).eq("is_active", true).order("name"),
    supabase.from("vessels").select("name").is("deleted_at", null).eq("is_active", true).order("name"),
  ]);

  // Serialize permissions as a plain object — functions can't cross the
  // server → client component boundary in Next.js.
  const writableCols = EDITABLE_COLS.filter(
    (col) => perms?.canWrite("consignments", col) ?? false
  );

  return (
    <EditConsignmentForm
      consignment={{ ...consignment, clients: clientData, icds: icdData }}
      clients={clients ?? []}
      icds={icds ?? []}
      vessels={(vessels ?? []).map((v) => v.name)}
      writableCols={writableCols}
    />
  );
}

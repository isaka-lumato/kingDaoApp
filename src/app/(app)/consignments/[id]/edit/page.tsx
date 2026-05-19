import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import EditConsignmentForm from "./edit-consignment-form";

export const metadata: Metadata = { title: "Edit Consignment — KDL Tracker" };

export default async function EditConsignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();

  const { data: consignment, error } = await supabase
    .from("consignments")
    .select(`*, clients(id, name), icds(id, name, code)`)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !consignment) notFound();

  const [{ data: clients }, { data: icds }] = await Promise.all([
    supabase.from("clients").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("icds").select("id, name, code").order("name"),
  ]);

  return (
    <EditConsignmentForm
      consignment={consignment}
      clients={clients ?? []}
      icds={icds ?? []}
      canWrite={(col: string) => perms?.canWrite("consignments", col) ?? false}
    />
  );
}

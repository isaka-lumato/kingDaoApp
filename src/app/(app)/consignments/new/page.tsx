import type { Metadata } from "next";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import NewConsignmentForm from "./new-consignment-form";

export const metadata: Metadata = { title: "New Consignment — KDL Tracker" };

export default async function NewConsignmentPage() {
  const supabase = getSupabaseAdminClient();

  const [{ data: clients }, { data: icds }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("icds")
      .select("id, name, location")
      .order("name"),
  ]);

  return (
    <NewConsignmentForm
      clients={clients ?? []}
      icds={icds ?? []}
    />
  );
}

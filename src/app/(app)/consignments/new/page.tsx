import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import NewConsignmentForm from "./new-consignment-form";

export const metadata: Metadata = { title: "New Consignment — KDL Tracker" };

export default async function NewConsignmentPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: clients }, { data: icds }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("icds")
      .select("id, name, code")
      .order("name"),
  ]);

  return (
    <NewConsignmentForm
      clients={clients ?? []}
      icds={icds ?? []}
    />
  );
}

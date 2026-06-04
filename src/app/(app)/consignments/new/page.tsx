import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import NewConsignmentForm from "./new-consignment-form";

export const metadata: Metadata = { title: "New Consignment — KDL Tracker" };

export default async function NewConsignmentPage() {
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();

  const [{ data: clients }, { data: icds }, { data: vessels }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, sub_label")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("icds")
      .select("id, name, location")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("vessels")
      .select("name")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <NewConsignmentForm
      clients={clients ?? []}
      icds={icds ?? []}
      vessels={(vessels ?? []).map((v) => v.name)}
    />
  );
}

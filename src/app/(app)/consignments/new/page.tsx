import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import NewConsignmentForm from "./new-consignment-form";

export const metadata: Metadata = { title: "New Consignment — KDL Tracker" };

export default async function NewConsignmentPage() {
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();

  // D-071: the intake form no longer collects ICD (captured at the Manifest
  // drop-popup), so only clients + vessels are needed here.
  const [{ data: clients }, { data: vessels }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, display_name")
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
      vessels={(vessels ?? []).map((v) => v.name)}
    />
  );
}

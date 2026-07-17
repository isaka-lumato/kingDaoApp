import type { Metadata } from "next";
import { fetchKanbanData } from "@/server/actions/consignments";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import HomeShell from "./home-shell";

export const metadata: Metadata = { title: "Pipeline — KDL Tracker" };

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const supabase = await getSupabaseServerClient();
  // D-071: ICDs power the Manifest drop-popup on the board.
  const [{ byStage, error }, { data: icds }] = await Promise.all([
    fetchKanbanData(year),
    supabase
      .from("icds")
      .select("id, name, location")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <HomeShell
      byStage={byStage}
      year={year}
      fetchError={error}
      icds={icds ?? []}
    />
  );
}

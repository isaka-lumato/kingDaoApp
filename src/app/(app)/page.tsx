import type { Metadata } from "next";
import { fetchKanbanData } from "@/server/actions/consignments";
import KanbanBoardClient from "./kanban-board-client";

export const metadata: Metadata = { title: "Pipeline — KDL Tracker" };

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const { byStage, error } = await fetchKanbanData(year);

  return <KanbanBoardClient byStage={byStage} year={year} fetchError={error} />;
}

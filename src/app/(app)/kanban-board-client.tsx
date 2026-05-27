"use client";

import dynamic from "next/dynamic";
import { type StageField, type KanbanConsignment } from "@/lib/pipeline";

const KanbanBoard = dynamic(() => import("./kanban-board"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading board…
    </div>
  ),
});

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
};

export default function KanbanBoardClient(props: Props) {
  return <KanbanBoard {...props} />;
}

"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { StageField, KanbanConsignment } from "@/server/actions/consignments";
import KanbanCard from "./kanban-card";

const STAGE_COLORS: Record<string, string> = {
  manifest_status: "border-t-blue-500",
  shipping_batch_status: "border-t-indigo-500",
  tanesws_status: "border-t-violet-500",
  assessment_status: "border-t-purple-500",
  tbs_loading_status: "border-t-pink-500",
  tbs_debit_status: "border-t-rose-500",
  manifest_comp_status: "border-t-orange-500",
  duty_status: "border-t-amber-500",
  inspection_file_status: "border-t-yellow-500",
  release_status: "border-t-green-500",
};

type Props = {
  field: StageField;
  label: string;
  cards: KanbanConsignment[];
  isPending: boolean;
};

export default function KanbanColumn({ field, label, cards, isPending }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: field });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col w-[248px] shrink-0 rounded-xl border border-border bg-card/60 transition-colors",
        `border-t-2 ${STAGE_COLORS[field] ?? "border-t-brand"}`,
        isOver ? "bg-card ring-2 ring-brand/30" : "",
        isPending ? "opacity-60 pointer-events-none" : "",
      ].join(" ")}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 font-medium">
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground/60 select-none">
              Empty
            </div>
          ) : (
            cards.map((card) => (
              <KanbanCard key={card.id} card={card} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

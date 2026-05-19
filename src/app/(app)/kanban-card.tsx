"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { KanbanConsignment } from "@/server/actions/consignments";

type Props = {
  card: KanbanConsignment;
  isDragging?: boolean;
};

const STATUS_DOT: Record<string, string> = {
  Action: "bg-stage-action",
  Waiting: "bg-stage-waiting",
  Done: "bg-stage-done",
};

export default function KanbanCard({ card, isDragging = false }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: card.id, data: { card } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const stageStatus = card[card.active_stage] as string;
  const isStuck = stageStatus === "Action"; // simplified — full stuck check needs stage_history
  const containerLabel = card.container_count
    ? `${card.container_count} ${card.container_type ?? ""}`.trim()
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "rounded-lg border border-border bg-card p-3 space-y-2 cursor-grab active:cursor-grabbing",
        "hover:border-brand/40 hover:shadow-md transition-all select-none",
        "group",
        isSortableDragging || isDragging
          ? "opacity-40 shadow-2xl scale-105 border-brand/60"
          : "",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[stageStatus] ?? "bg-muted"}`}
            title={stageStatus}
          />
          <Link
            href={`/consignments/${card.id}`}
            className="text-xs font-bold text-foreground hover:text-brand transition-colors font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {card.ref_no}
          </Link>
        </div>
        <span className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 shrink-0">
          {card.year}
        </span>
      </div>

      {/* Client name */}
      <p className="text-xs font-medium text-foreground/80 truncate">
        {card.client_name}
      </p>

      {/* Goods description */}
      {card.goods_description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
          {card.goods_description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {card.vessel_name && (
            <span className="truncate max-w-[90px]" title={card.vessel_name}>
              ⚓ {card.vessel_name}
            </span>
          )}
          {containerLabel && (
            <span>📦 {containerLabel}</span>
          )}
        </div>
        {card.arrival_date && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(card.arrival_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        )}
      </div>

      {/* Stage status badge */}
      <div className="flex items-center justify-between pt-0.5 border-t border-border/50">
        <span
          className={[
            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
            stageStatus === "Action"
              ? "bg-stage-action/15 text-stage-action border border-stage-action/30"
              : stageStatus === "Done"
              ? "bg-stage-done/15 text-stage-done border border-stage-done/30"
              : "bg-stage-waiting/15 text-stage-waiting border border-stage-waiting/30",
          ].join(" ")}
        >
          {stageStatus}
        </span>
        {isStuck && (
          <span className="text-[10px] text-stage-stuck font-semibold animate-pulse">
            ⚠ Action
          </span>
        )}
      </div>
    </div>
  );
}

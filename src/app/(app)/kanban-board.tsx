"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  PIPELINE_STAGES,
  STAGE_DONE_VALUE,
  type StageField,
  type KanbanConsignment,
} from "@/lib/pipeline";
import { advanceStageAction } from "@/server/actions/consignments";
import { usePermissions } from "@/hooks/use-permissions";
import ForceStageDialog from "@/components/force-stage-dialog";
import KanbanCard from "./kanban-card";
import KanbanColumn from "./kanban-column";

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
};

export default function KanbanBoard({ byStage, year, fetchError }: Props) {
  const [activeCard, setActiveCard] = useState<KanbanConsignment | null>(null);
  const [forceDialog, setForceDialog] = useState<{
    card: KanbanConsignment;
    toStage: StageField;
    newValue: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const perms = usePermissions();

  // Viewer-or-other roles cannot move cards. Admins + operators can.
  // Caller-role check is also enforced in the advance_stage() DB function
  // (D-029) — this UI gate is the UX layer.
  const canDrag = perms.isAdmin || perms.roles.includes("operator");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const stageIndex = (field: StageField) =>
    PIPELINE_STAGES.findIndex((s) => s.field === field);

  function handleDragStart(e: DragStartEvent) {
    const card = e.active.data.current?.card as KanbanConsignment;
    setActiveCard(card ?? null);
    setError(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const card = e.active.data.current?.card as KanbanConsignment | undefined;
    const toField = e.over?.id as StageField | undefined;

    if (!card || !toField || toField === card.active_stage) return;

    // Belt-and-braces: even if a viewer bypasses the card-level `disabled`
    // flag, refuse here. The DB function rejects too (D-029).
    if (!canDrag) {
      setError("Your role cannot move pipeline cards.");
      return;
    }

    const fromIdx = stageIndex(card.active_stage);
    const toIdx = stageIndex(toField);

    if (toIdx < fromIdx) {
      // Backward move — admin only with reason
      if (!perms.isAdmin) {
        setError("Only admins can move cards backward in the pipeline.");
        return;
      }
      setForceDialog({ card, toStage: toField, newValue: "Action" });
      return;
    }

    // Forward move — "advance one stage at a time" semantics.
    // Per the Kanban product model, a forward drag means "I'm done with the
    // CURRENT active stage." We mark the source stage as done (Uploaded /
    // Closed / Paid / Done / Released — see STAGE_DONE_VALUE) and let the
    // server's resolveActiveStage recompute which column the card belongs in
    // on refetch. The drop target column is intentionally ignored beyond
    // direction (forward vs backward) — if the user overshoots, the card
    // moves one column forward and they can drag again. The DB function
    // enforces PRD §7.1 (stages must complete in order); since we only
    // advance the active stage, prereqs are by definition satisfied.
    const fd = new FormData();
    fd.set("consignmentId", card.id);
    fd.set("stage", card.active_stage);
    fd.set("newValue", STAGE_DONE_VALUE[card.active_stage]);
    startTransition(async () => {
      const res = await advanceStageAction(fd);
      if (res?.error) setError(res.error);
    });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
  const totalCards = PIPELINE_STAGES.reduce(
    (sum, s) => sum + (byStage[s.field]?.length ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Pipeline Board</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {totalCards} active consignment{totalCards !== 1 ? "s" : ""} · {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year selector */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {yearOptions.map((y) => (
              <Link
                key={y}
                href={`/?year=${y}`}
                className={[
                  "px-3 py-1.5 transition-colors",
                  y === year
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-card text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {y}
              </Link>
            ))}
          </div>
          <Link
            href="/consignments/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {(error || fetchError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error ?? fetchError}</span>
          <button onClick={() => setError(null)} className="ml-4 hover:opacity-70">✕</button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          id="kanban-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 h-full" style={{ minWidth: `${PIPELINE_STAGES.length * 260}px` }}>
            {PIPELINE_STAGES.map((stage) => (
              <KanbanColumn
                key={stage.field}
                field={stage.field}
                label={stage.label}
                cards={byStage[stage.field] ?? []}
                isPending={isPending}
                canDrag={canDrag}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard && (
              <KanbanCard card={activeCard} isDragging canDrag={canDrag} />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {forceDialog && (
        <ForceStageDialog
          open
          onOpenChange={(o) => { if (!o) setForceDialog(null); }}
          consignmentId={forceDialog.card.id}
          refNo={forceDialog.card.ref_no}
          defaultStage={forceDialog.toStage}
          defaultValue={forceDialog.newValue}
          onSuccess={() => setForceDialog(null)}
          onError={setError}
        />
      )}
    </div>
  );
}

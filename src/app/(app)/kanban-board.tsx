"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  PIPELINE_STAGES,
  STAGE_DONE_VALUE,
  resolveActiveStage,
  STAGE_FIELDS,
  type StageField,
  type KanbanConsignment,
} from "@/lib/pipeline";
import { advanceStageAction } from "@/server/actions/consignments";
import { usePermissions } from "@/hooks/use-permissions";
import ForceStageDialog from "@/components/force-stage-dialog";
import KanbanCard from "./kanban-card";
import KanbanColumn from "./kanban-column";
// Type-only — erased at compile time, so canvas-confetti stays out of the
// initial/SSR bundle; the value is import()-ed lazily in celebrateRelease.
import type { Options as ConfettiOptions } from "canvas-confetti";

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
};

type Board = Record<StageField, KanbanConsignment[]>;

// Optimistic move: pull `card` out of whichever column currently holds it and
// drop it into `landingStage` (the stage the server will recompute it into).
// Returns a fresh Board so React sees a new reference. If the card lands past
// the visible board (fully released), it's simply removed — the real fetch
// filters released rows out (.neq("release_status","Released")).
type OptimisticMove = {
  card: KanbanConsignment;
  landingStage: StageField;
  removed: boolean;
};

function applyMove(board: Board, move: OptimisticMove): Board {
  const next = {} as Board;
  for (const field of STAGE_FIELDS) {
    next[field] = board[field].filter((c) => c.id !== move.card.id);
  }
  if (!move.removed) {
    next[move.landingStage] = [
      { ...move.card, active_stage: move.landingStage },
      ...next[move.landingStage],
    ];
  }
  return next;
}

// Forgiving drop detection: register the drop wherever the *pointer* is, not
// where the card's center happens to be. Falls back to rectangle intersection
// when the pointer is released in a gutter between columns, so an off-center
// drop still snaps into the nearest column instead of being discarded.
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : rectIntersection(args);
};

// Droppable id for the drag-to-release target. Sentinel (not a StageField) so
// handleDragEnd can special-case it — see D-049.
const RELEASE_DROP_ID = "__release__";

// Celebration when a consignment is released (D-049). canvas-confetti is
// browser-only and imported lazily so it stays out of the initial chunk and
// never runs during SSR (the board is already dynamic ssr:false). Failure to
// load is non-fatal — the release already succeeded; the toast still shows.
async function celebrateRelease() {
  try {
    const confetti = (await import("canvas-confetti")).default;
    const fire = (particleRatio: number, opts: ConfettiOptions) =>
      confetti({
        origin: { y: 0.7 },
        spread: 70,
        startVelocity: 45,
        particleCount: Math.floor(200 * particleRatio),
        ...opts,
      });
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.35, { spread: 60 });
    fire(0.2, { spread: 100, decay: 0.91, scalar: 0.8 });
  } catch {
    // confetti is pure delight — swallow any load/runtime error.
  }
}

// Slim drop target to the right of the Release column. Dropping a Release-stage
// card here releases it; the highlight reacts to isOver. Kept separate because
// useDroppable is a hook and the board already wires its own droppables per
// column via KanbanColumn — D-049.
function ReleaseDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: RELEASE_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col w-[120px] shrink-0 items-center justify-center rounded-xl border-2 border-dashed transition-colors text-center px-2",
        isOver
          ? "border-green-500 bg-green-500/10 text-green-600"
          : "border-border/60 text-muted-foreground/70",
      ].join(" ")}
    >
      <span className="text-2xl leading-none mb-1">🎉</span>
      <span className="text-xs font-semibold uppercase tracking-wide">
        Release ✓
      </span>
      <span className="mt-1 text-[10px] leading-tight">
        Drop a Release card here
      </span>
    </div>
  );
}

export default function KanbanBoard({ byStage, year, fetchError }: Props) {
  const [activeCard, setActiveCard] = useState<KanbanConsignment | null>(null);
  const [forceDialog, setForceDialog] = useState<{
    card: KanbanConsignment;
    toStage: StageField;
    newValue: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimisticBoard, applyOptimistic] = useOptimistic(byStage, applyMove);
  const perms = usePermissions();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wheel handling. A plain vertical wheel should scroll the column under the
  // cursor (its card list) like normal; we only redirect it to *horizontal*
  // board scroll when there's a clear reason to:
  //   1. Shift is held — the web convention for "scroll sideways".
  //   2. The column under the cursor can't scroll any further in the wheel's
  //      direction (short column, or already at top/bottom) — so the gesture
  //      isn't wasted and traverses columns instead.
  // Trackpads emit deltaX natively, so we ignore events that are already
  // horizontal and let the browser handle them.
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;

    // Already a horizontal gesture (trackpad) — leave it to the browser.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    const delta = e.deltaY;

    if (!e.shiftKey) {
      // Find the column card-list under the cursor and see if it can still
      // scroll vertically in this direction. If so, let it — don't hijack.
      const colScroller = (e.target as HTMLElement)?.closest<HTMLElement>(
        "[data-kanban-scroll]"
      );
      if (colScroller) {
        const { scrollTop, scrollHeight, clientHeight } = colScroller;
        const canScrollDown = delta > 0 && scrollTop + clientHeight < scrollHeight - 1;
        const canScrollUp = delta < 0 && scrollTop > 0;
        if (canScrollDown || canScrollUp) return;
      }
    }

    // Otherwise translate the vertical wheel into horizontal board movement.
    el.scrollLeft += delta;
  }

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
    setInfo(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const card = e.active.data.current?.card as KanbanConsignment | undefined;
    const overId = e.over?.id as StageField | typeof RELEASE_DROP_ID | undefined;

    if (!card || !overId) return;

    // Drag-to-release zone (D-049). releaseConsignment guards role + that the
    // card is actually in Release, surfacing a friendly message otherwise.
    if (overId === RELEASE_DROP_ID) {
      releaseConsignment(card);
      return;
    }

    // Resolve the drop target to a column (StageField). Because every card is a
    // sortable droppable, dropping ON or ABOVE another card reports that card's
    // id (a UUID) as `over.id`, not the column's field. We only care which
    // column the card landed in — the "advance one stage" model ignores
    // position within a column — so map a card drop to that card's stage. The
    // dragged card carries its full record in over.data.card (see KanbanCard's
    // useSortable data prop). Anything we still can't resolve is ignored rather
    // than fed into stageIndex() as a bogus -1 (which surfaced as a spurious
    // error when dropping near a card instead of on empty space).
    const overCard = e.over?.data.current?.card as
      | KanbanConsignment
      | undefined;
    const toField: StageField | undefined = STAGE_FIELDS.includes(
      overId as StageField
    )
      ? (overId as StageField)
      : overCard?.active_stage;

    if (!toField) return;
    if (toField === card.active_stage) return;

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
    const newValue = STAGE_DONE_VALUE[card.active_stage];

    // Compute where the card will ACTUALLY land, the same way the server's
    // fetchKanbanData → resolveActiveStage will: clone the card's stage values,
    // mark the source field done, then resolve the first non-complete stage.
    // This may differ from the column the user dropped on when later stages are
    // already at their done value (imported data with gaps) — the card then
    // jumps several columns forward, which previously looked like it vanished.
    const stageValues: Record<string, string> = {};
    for (const f of STAGE_FIELDS) stageValues[f] = card[f];
    stageValues[card.active_stage] = newValue;
    const landingStage = resolveActiveStage(stageValues);

    // A card whose remaining stages were all already done lands on release as
    // "Released" — fetchKanbanData filters those out, so it legitimately leaves
    // the active board. Detect that so we can explain the disappearance.
    const fullyReleased =
      landingStage === "release_status" &&
      stageValues.release_status === STAGE_DONE_VALUE.release_status;

    console.log("[kanban] advance", {
      id: card.id,
      ref_no: card.ref_no,
      from: card.active_stage,
      dropTarget: toField,
      landingStage,
      newValue,
      fullyReleased,
    });

    const fd = new FormData();
    fd.set("consignmentId", card.id);
    fd.set("stage", card.active_stage);
    fd.set("newValue", newValue);
    startTransition(async () => {
      // Optimistically move the card to its computed landing column (or off the
      // board if fully released) so the UI feels instant. Reverts automatically
      // if the server action throws or the refetched props don't confirm it.
      applyOptimistic({ card, landingStage, removed: fullyReleased });

      const res = await advanceStageAction(fd);
      if (res?.error) {
        console.error("[kanban] advance failed", {
          id: card.id,
          ref_no: card.ref_no,
          error: res.error,
        });
        setError(res.error);
        return;
      }
      console.log("[kanban] advance ok", {
        id: card.id,
        ref_no: card.ref_no,
        landingStage,
      });
      if (fullyReleased) {
        setInfo(
          `${card.ref_no} is fully released — moved off the active board.`
        );
      }
    });
  }

  // Shared release routine for both triggers (the per-card "Mark Released"
  // button and the drag-to-release zone — D-049). A card is releasable only
  // when it's the active stage is release_status; the caller guarantees that,
  // but we re-check role here (belt-and-braces; advance_stage() re-checks too,
  // D-029). Optimistically removes the card (release filters it off the board
  // on refetch), then advances release_status → "Released" and celebrates.
  function releaseConsignment(card: KanbanConsignment) {
    setError(null);
    setInfo(null);

    if (!canDrag) {
      setError("Your role cannot release consignments.");
      return;
    }
    if (card.active_stage !== "release_status") {
      setInfo(`Move ${card.ref_no} to Release before releasing it.`);
      return;
    }

    const fd = new FormData();
    fd.set("consignmentId", card.id);
    fd.set("stage", "release_status");
    fd.set("newValue", STAGE_DONE_VALUE.release_status); // "Released"

    startTransition(async () => {
      applyOptimistic({ card, landingStage: "release_status", removed: true });

      const res = await advanceStageAction(fd);
      if (res?.error) {
        console.error("[kanban] release failed", {
          id: card.id,
          ref_no: card.ref_no,
          error: res.error,
        });
        setError(res.error);
        return;
      }

      console.log("[kanban] released", { id: card.id, ref_no: card.ref_no });
      setInfo(`🎉 ${card.ref_no} released!`);
      void celebrateRelease();
    });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
  const totalCards = PIPELINE_STAGES.reduce(
    (sum, s) => sum + (optimisticBoard[s.field]?.length ?? 0),
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

      {/* Info banner — non-error notices (e.g. a card released off the board) */}
      {info && (
        <div className="rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-foreground flex items-center justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="ml-4 hover:opacity-70">✕</button>
        </div>
      )}

      {/* Kanban columns. The relative wrapper hosts the edge-fade overlays that
          hint the board scrolls sideways past the viewport. */}
      <div className="relative flex-1 min-h-0">
        {/* Edge fades — soft gradient framing on left/right that signals there
            are more columns off-screen. pointer-events-none so they never block
            drag or scroll. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-background to-transparent" />

        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="h-full overflow-x-auto overscroll-x-contain pb-3 scrollbar-thin"
        >
          <DndContext
            id="kanban-dnd"
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="flex gap-3 h-full"
              style={{ minWidth: `${PIPELINE_STAGES.length * 260 + (canDrag ? 132 : 0)}px` }}
            >
              {PIPELINE_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage.field}
                  field={stage.field}
                  label={stage.label}
                  cards={optimisticBoard[stage.field] ?? []}
                  isPending={isPending}
                  canDrag={canDrag}
                  onRelease={releaseConsignment}
                />
              ))}

              {/* Drag-to-release target, just past the Release column (D-049). */}
              {canDrag && <ReleaseDropZone />}
            </div>

            <DragOverlay>
              {activeCard && (
                <KanbanCard card={activeCard} isDragging canDrag={canDrag} />
              )}
            </DragOverlay>
          </DndContext>
        </div>
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

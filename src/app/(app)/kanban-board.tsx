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
  isNewConsignment,
  gatedPopupForForwardMove,
  NEW_COLUMN_ID,
  type StageField,
  type KanbanConsignment,
  type DropPopupKind,
} from "@/lib/pipeline";
import { advanceStageAction } from "@/server/actions/consignments";
import { usePermissions } from "@/hooks/use-permissions";
import ForceStageDialog from "@/components/force-stage-dialog";
import IntakeDialog, { type IntakeIcd } from "@/components/intake-dialog";
import KanbanCard from "./kanban-card";
import KanbanColumn from "./kanban-column";
// Type-only — erased at compile time, so canvas-confetti stays out of the
// initial/SSR bundle; the value is import()-ed lazily in celebrateRelease.
import type { Options as ConfettiOptions } from "canvas-confetti";

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
  /** ICDs for the Manifest drop-popup (D-071). */
  icds?: IntakeIcd[];
};

type Board = Record<StageField, KanbanConsignment[]>;

// A pending gated advance: the drop opened a popup and we're waiting for the
// operator to submit the intake fields before committing. D-071.
type PendingGate = {
  card: KanbanConsignment;
  kind: DropPopupKind;
  stage: StageField; // the stage column to advance
  newValue: string; // the value to set it to
  landingStage: StageField; // where the card will visibly land
};

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

export default function KanbanBoard({ byStage, year, fetchError, icds = [] }: Props) {
  const [activeCard, setActiveCard] = useState<KanbanConsignment | null>(null);
  const [forceDialog, setForceDialog] = useState<{
    card: KanbanConsignment;
    toStage: StageField;
    newValue: string;
  } | null>(null);
  // D-071: a drag that needs a blocking drop-popup before it can commit.
  const [pendingGate, setPendingGate] = useState<PendingGate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimisticBoard, applyOptimistic] = useOptimistic(byStage, applyMove);
  const perms = usePermissions();
  const scrollRef = useRef<HTMLDivElement>(null);

  // The board splits Manifest-stage cards into the New-Consignments pseudo-column
  // (intake-only: no actual arrival yet) and the real Manifest column. D-071.
  const manifestCards = optimisticBoard.manifest_status ?? [];
  const newCards = manifestCards.filter((c) => isNewConsignment(c));
  const manifestReadyCards = manifestCards.filter((c) => !isNewConsignment(c));

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
  const canWriteStage = (field: StageField) =>
    perms.isAdmin ||
    perms.columns.some(
      (permission) =>
        permission.tableName === "consignments" &&
        permission.columnName === field &&
        permission.canWrite,
    );
  const canDrag = STAGE_FIELDS.some((field) => canWriteStage(field));
  const canCreateConsignments =
    perms.isAdmin ||
    perms.columns.some(
      (permission) =>
        permission.tableName === "consignments" &&
        permission.columnName === "ref_no" &&
        permission.canWrite,
    );

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

  // Shared commit path for every stage advance (drag, popup submit, action
  // menu). `card` may be pre-patched with intake fields so the optimistic
  // render matches the post-refetch state (e.g. arrival_date set → the card
  // leaves the New column). `extra` rides along to advance_stage's p_extra.
  function commitAdvance(opts: {
    card: KanbanConsignment;
    stage: StageField;
    newValue: string;
    landingStage: StageField;
    fullyReleased: boolean;
    extra?: Record<string, string>;
  }) {
    const { card, stage, newValue, landingStage, fullyReleased, extra } = opts;
    const fd = new FormData();
    fd.set("consignmentId", card.id);
    fd.set("stage", stage);
    fd.set("newValue", newValue);
    if (extra) fd.set("extra", JSON.stringify(extra));

    startTransition(async () => {
      applyOptimistic({ card, landingStage, removed: fullyReleased });
      const res = await advanceStageAction(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (fullyReleased) {
        setInfo(`${card.ref_no} is fully released — moved off the active board.`);
      }
    });
  }

  // Compute the landing column the same way the server's resolveActiveStage
  // will (nature-aware, so Export/Transit cards skip the TBS columns).
  function landingFor(card: KanbanConsignment, stage: StageField, newValue: string) {
    const stageValues: Record<string, string> = {};
    for (const f of STAGE_FIELDS) stageValues[f] = card[f];
    stageValues[stage] = newValue;
    const landingStage = resolveActiveStage(stageValues, card.consignment_nature);
    const fullyReleased =
      landingStage === "release_status" &&
      stageValues.release_status === STAGE_DONE_VALUE.release_status;
    return { landingStage, fullyReleased };
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const card = e.active.data.current?.card as KanbanConsignment | undefined;
    const overId = e.over?.id as
      | StageField
      | typeof RELEASE_DROP_ID
      | typeof NEW_COLUMN_ID
      | undefined;

    if (!card || !overId) return;

    // Drag-to-release zone (D-049).
    if (overId === RELEASE_DROP_ID) {
      releaseConsignment(card);
      return;
    }

    // Resolve the drop target column. Dropping on a card reports that card's id
    // (a UUID); map it to that card's active_stage. The New pseudo-column
    // reports NEW_COLUMN_ID.
    const overCard = e.over?.data.current?.card as KanbanConsignment | undefined;
    const dropTarget: StageField | typeof NEW_COLUMN_ID | undefined =
      overId === NEW_COLUMN_ID
        ? NEW_COLUMN_ID
        : STAGE_FIELDS.includes(overId as StageField)
          ? (overId as StageField)
          : overCard?.active_stage;

    if (!dropTarget) return;

    // Belt-and-braces role check (DB re-checks too, D-029).
    if (!canWriteStage(card.active_stage)) {
      setError("Your role cannot update this pipeline stage.");
      return;
    }

    const isNew = isNewConsignment(card);

    // ── D-071 gated transitions ───────────────────────────────────────────
    // New → Manifest: opens the Manifest popup (arrival + ICD). The advance is
    // manifest → Action (card enters processing), NOT → Uploaded.
    if (isNew && dropTarget === "manifest_status") {
      setError(null);
      setPendingGate({
        card,
        kind: "manifest",
        stage: "manifest_status",
        newValue: "Action",
        landingStage: "manifest_status",
      });
      return;
    }
    // Dropping a New card anywhere else (or onto the New column) is a no-op —
    // it must go through the Manifest popup first.
    if (isNew) return;

    if (dropTarget === NEW_COLUMN_ID) return; // can't move a real card back to New

    if (dropTarget === card.active_stage) return;

    const fromIdx = stageIndex(card.active_stage);
    const toIdx = stageIndex(dropTarget);

    if (toIdx < fromIdx) {
      // Backward move — admin only, with reason.
      if (!perms.isAdmin) {
        setError("Only admins can move cards backward in the pipeline.");
        return;
      }
      setForceDialog({ card, toStage: dropTarget, newValue: "Action" });
      return;
    }

    // Forward move — advance the current active stage to its done value.
    const stage = card.active_stage;
    const newValue = STAGE_DONE_VALUE[stage];
    const { landingStage, fullyReleased } = landingFor(card, stage, newValue);

    // Does entering the landing stage require a blocking drop-popup? (D-071)
    const popup = gatedPopupForForwardMove(card, dropTarget, landingStage);
    if (popup === "duty_application") {
      setError(null);
      setPendingGate({ card, kind: "duty_application", stage, newValue, landingStage });
      return;
    }

    commitAdvance({ card, stage, newValue, landingStage, fullyReleased });
  }

  // Popup submit — commit the gated advance with the collected intake fields.
  function confirmGate(extra: Record<string, string>) {
    if (!pendingGate) return;
    const { card, kind, stage, newValue, landingStage } = pendingGate;
    // Patch the optimistic card so it renders in the right column immediately
    // (e.g. arrival_date set → the manifest gate moves it out of New).
    const patched: KanbanConsignment = {
      ...card,
      ...(extra.arrival_date ? { arrival_date: extra.arrival_date } : {}),
      ...(extra.ref_no ? { ref_no: extra.ref_no } : {}),
      ...(extra.ucr_no ? { ucr_no: extra.ucr_no } : {}),
      [stage]: newValue,
    };
    commitAdvance({
      card: patched,
      stage,
      newValue,
      landingStage,
      fullyReleased: false,
      extra,
    });
    setPendingGate(null);
    // A manifest-gate card that stays in the manifest column reads clearer with
    // a hint, since it visually jumps from New to Manifest.
    if (kind === "manifest") {
      setInfo(`${card.ref_no} moved into Manifest.`);
    }
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

    if (!canWriteStage("release_status")) {
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
          {canCreateConsignments && (
            <Link
              href="/consignments/new"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New
            </Link>
          )}
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
              style={{ minWidth: `${(PIPELINE_STAGES.length + 1) * 260 + (canDrag ? 132 : 0)}px` }}
            >
              {/* New Consignments intake bucket (D-071) — left of Manifest. */}
              <KanbanColumn
                key={NEW_COLUMN_ID}
                field="manifest_status"
                droppableId={NEW_COLUMN_ID}
                label="New Consignments"
                cards={newCards}
                isPending={isPending}
                canDrag={canDrag}
              />

              {PIPELINE_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage.field}
                  field={stage.field}
                  label={stage.label}
                  cards={
                    stage.field === "manifest_status"
                      ? manifestReadyCards
                      : optimisticBoard[stage.field] ?? []
                  }
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

      {/* Blocking drop-popups (D-071). Cancel discards the pending advance so
          the card stays put (no optimistic move was applied). */}
      {pendingGate && (
        <IntakeDialog
          kind={pendingGate.kind}
          refNo={pendingGate.card.ref_no}
          icds={icds}
          defaultRef={pendingGate.card.ref_no}
          defaultTansad={pendingGate.card.tansad_no ?? null}
          defaultUcr={pendingGate.card.ucr_no}
          onConfirm={confirmGate}
          onCancel={() => setPendingGate(null)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

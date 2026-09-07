"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  PIPELINE_STAGES,
  STAGE_DONE_VALUE,
  STAGE_FIELDS,
  isStageComplete,
  isNewConsignment,
  gatedPopupForForwardMove,
  isReleaseAdvance,
  resolveActiveStage,
  type StageField,
  type KanbanConsignment,
  type DropPopupKind,
} from "@/lib/pipeline";
import { advanceStageAction } from "@/server/actions/consignments";
import { useInvalidateConsignments } from "@/hooks/use-invalidate-consignments";
import { usePermissions } from "@/hooks/use-permissions";
import { sortPipelineMatrixRows } from "@/lib/pipeline-matrix";
import StageConfirmDialog from "@/components/stage-confirm-dialog";
import ForceStageDialog from "@/components/force-stage-dialog";
import type { IntakeIcd } from "@/components/intake-dialog";
import type { Options as ConfettiOptions } from "canvas-confetti";

type Props = {
  byStage: Record<StageField, KanbanConsignment[]>;
  year: number;
  fetchError?: string;
  icds?: IntakeIcd[];
};

type StatusFilter = "ALL" | "ACTION" | "STUCK" | "RELEASED";

type PendingConfirm = {
  consignment: KanbanConsignment;
  currentStage: StageField;
  targetValue: string;
  landingStage: StageField;
  popupKind: DropPopupKind | null;
  fullyReleased: boolean;
};

// Lazy celebrate confetti on final release (D-049)
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
    // Canvas confetti is optional
  }
}

export default function PipelineMatrix({ byStage, year, fetchError, icds = [] }: Props) {
  const perms = usePermissions();
  const invalidateConsignments = useInvalidateConsignments();
  const [isPending, startTransition] = useTransition();

  // Active filter & search state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dialog states
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [forceDialog, setForceDialog] = useState<{
    card: KanbanConsignment;
    stage: StageField;
  } | null>(null);

  // The incoming data is grouped for the Kanban. The Matrix is a worksheet,
  // so rows must keep a stable chronological order regardless of stage (D-075).
  const initialRows = useMemo(() => {
    return sortPipelineMatrixRows(Object.values(byStage).flat());
  }, [byStage]);

  // Optimistic updates for matrix rows
  const [rows, applyOptimistic] = useOptimistic(
    initialRows,
    (currentRows, update: { id: string; patched: Partial<KanbanConsignment> }) => {
      return currentRows.map((row) =>
        row.id === update.id ? { ...row, ...update.patched } : row
      );
    }
  );

  // Permission check helper for each stage column
  const canWriteStage = (field: StageField) =>
    perms.isAdmin ||
    perms.columns.some(
      (permission) =>
        permission.tableName === "consignments" &&
        permission.columnName === field &&
        permission.canWrite
    );

  const canCreateConsignments =
    perms.isAdmin ||
    perms.columns.some(
      (permission) =>
        permission.tableName === "consignments" &&
        permission.columnName === "ref_no" &&
        permission.canWrite
    );

  // Calculate stats & counts
  const totalCount = rows.length;
  const activeCount = rows.filter((r) => r.release_status !== "Released").length;
  const actionNeededCount = rows.filter(
    (r) => r.release_status !== "Released" && r[r.active_stage] === "Action",
  ).length;
  const awaitingExternalCount = rows.filter(
    (r) => r.release_status !== "Released" && r[r.active_stage] === "Waiting",
  ).length;
  const stuckCount = rows.filter(
    (r) => r.release_status !== "Released" && isRowStuck(r)
  ).length;
  const releasedCount = rows.filter((r) => r.release_status === "Released").length;

  function isRowStuck(r: KanbanConsignment): boolean {
    if (r.release_status === "Released") return false;
    const updatedAt = Date.parse(r.updated_at);
    return Number.isFinite(updatedAt) && Date.now() - updatedAt > 48 * 3600 * 1000;
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((r) => {
      // Status filter
      const isRel = r.release_status === "Released";
      if (statusFilter === "ACTION" && (isRel || r[r.active_stage] !== "Action")) {
        return false;
      }
      if (statusFilter === "STUCK" && (!isRowStuck(r) || isRel)) return false;
      if (statusFilter === "RELEASED" && !isRel) return false;

      // Text search
      if (q) {
        const matches =
          r.ref_no.toLowerCase().includes(q) ||
          r.client_name.toLowerCase().includes(q) ||
          (r.vessel_name && r.vessel_name.toLowerCase().includes(q)) ||
          (r.bl_number && r.bl_number.toLowerCase().includes(q)) ||
          (r.goods_description && r.goods_description.toLowerCase().includes(q)) ||
          (r.tansad_no && r.tansad_no.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [rows, statusFilter, searchQuery]);

  // Handle opening the confirmation safeguard dialog
  function promptAdvance(consignment: KanbanConsignment, stageField: StageField) {
    setErrorMessage(null);
    setInfoMessage(null);

    if (!canWriteStage(stageField)) {
      setErrorMessage("Your role does not have permission to update this stage.");
      return;
    }

    const isNew = isNewConsignment(consignment);
    const targetValue = isNew && stageField === "manifest_status" ? "Action" : STAGE_DONE_VALUE[stageField];

    // Compute expected landing stage
    const stageValues: Record<string, string> = {};
    for (const f of STAGE_FIELDS) stageValues[f] = consignment[f];
    stageValues[stageField] = targetValue;
    const landingStage = resolveActiveStage(stageValues, consignment.consignment_nature);
    const fullyReleased = isReleaseAdvance(stageField, targetValue);

    // Gated intake check (D-071)
    let popupKind: DropPopupKind | null = null;
    if (isNew && stageField === "manifest_status") {
      popupKind = "manifest";
    } else if (fullyReleased) {
      popupKind = "release";
    } else if (stageField === consignment.active_stage) {
      popupKind = gatedPopupForForwardMove(consignment, stageField, landingStage);
    }

    setPendingConfirm({
      consignment,
      currentStage: stageField,
      targetValue,
      landingStage,
      popupKind,
      fullyReleased,
    });
  }

  // Execute confirmed advance
  function executeAdvance(extra?: Record<string, string>) {
    if (!pendingConfirm) return;

    const { consignment, currentStage, targetValue, landingStage, fullyReleased } =
      pendingConfirm;

    const fd = new FormData();
    fd.set("consignmentId", consignment.id);
    fd.set("stage", currentStage);
    fd.set("newValue", targetValue);
    if (extra && Object.keys(extra).length > 0) {
      fd.set("extra", JSON.stringify(extra));
    }

    // Optimistic patch for instant visual responsiveness
    const patched: Partial<KanbanConsignment> = {
      [currentStage]: targetValue,
      active_stage: landingStage,
      ...(extra?.arrival_date ? { arrival_date: extra.arrival_date } : {}),
      ...(extra?.ref_no ? { ref_no: extra.ref_no } : {}),
      ...(extra?.tansad_no ? { tansad_no: extra.tansad_no } : {}),
      ...(extra?.ucr_no ? { ucr_no: extra.ucr_no } : {}),
      ...(extra?.efd_receipt_no ? { efd_receipt_no: extra.efd_receipt_no } : {}),
      ...(extra?.amount ? { amount: Number(extra.amount) } : {}),
      ...(extra?.remarks ? { remarks: extra.remarks } : {}),
    };

    startTransition(async () => {
      applyOptimistic({ id: consignment.id, patched });
      setPendingConfirm(null);

      const res = await advanceStageAction(fd);
      if (res?.error) {
        setErrorMessage(res.error);
        return;
      }

      // Invalidate TanStack query cache for seamless cross-screen sync (D-072)
      invalidateConsignments();

      const stageDef = PIPELINE_STAGES.find((s) => s.field === currentStage);
      if (fullyReleased) {
        setInfoMessage(`🎉 ${consignment.ref_no} officially Released!`);
        void celebrateRelease();
      } else {
        setInfoMessage(
          `✓ ${consignment.ref_no}: ${stageDef?.shortLabel ?? currentStage} marked complete.`
        );
      }
    });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Pipeline Matrix
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {totalCount} total · {activeCount} in clearance · {year}
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
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-xs"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New consignment
            </Link>
          )}
        </div>
      </div>

      {/* Messages */}
      {(errorMessage || fetchError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{errorMessage ?? fetchError}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-4 hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {infoMessage && (
        <div
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground flex items-center justify-between"
        >
          <span>{infoMessage}</span>
          <button
            type="button"
            onClick={() => setInfoMessage(null)}
            className="ml-4 hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Workbook-style scan strip — mirrors the reference matrix before the grid. */}
      <section
        aria-label="Pipeline summary"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Active pipeline
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tabular-nums text-foreground">
              {activeCount}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              In clearance
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-300/70 bg-amber-50/45 p-3.5 shadow-xs dark:bg-amber-950/20">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <span className="inline-block size-2 rounded-full bg-amber-500" />
            Action needed
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tabular-nums text-amber-900 dark:text-amber-200">
              {actionNeededCount}
            </span>
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Ready to advance
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Awaiting external
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tabular-nums text-foreground">
              {awaitingExternalCount}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Waiting stage
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-300/70 bg-emerald-50/45 p-3.5 shadow-xs dark:bg-emerald-950/20">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            Released
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
              {releasedCount}
            </span>
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              Completed jobs
            </span>
          </div>
        </div>
      </section>

      {/* Filter and search bar */}
      <div className="bg-card border border-border p-2.5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={[
              "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
              statusFilter === "ALL"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            ].join(" ")}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACTION")}
            className={[
              "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
              statusFilter === "ACTION"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            ].join(" ")}
          >
            Action Needed ({actionNeededCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("STUCK")}
            className={[
              "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
              statusFilter === "STUCK"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            ].join(" ")}
          >
            Stuck &gt; 48h ({stuckCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("RELEASED")}
            className={[
              "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
              statusFilter === "RELEASED"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            ].join(" ")}
          >
            Released ({releasedCount})
          </button>
        </div>

        {/* Search input & legend */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="6" />
              <path strokeLinecap="round" d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ref, client, vessel, B/L…"
              aria-label="Search matrix consignments"
              className="w-56 rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:w-64"
            />
          </div>

          <div className="hidden lg:flex items-center gap-3 text-[11px] text-muted-foreground font-medium pl-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              Action Needed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 inline-block" />
              Upcoming
            </span>
          </div>
        </div>
      </div>

      {/* Main interactive matrix table */}
      <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="max-h-[calc(100dvh-350px)] overflow-x-auto overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground font-semibold uppercase text-[11px] tracking-wide border-b border-border select-none">
                {/* Sticky Identity Headers */}
                <th className="sticky left-0 z-30 w-[112px] min-w-[112px] border-r border-border bg-muted/90 px-3.5 py-3">
                  REF NO
                </th>
                <th className="sticky left-[112px] z-30 w-[184px] min-w-[184px] border-r border-border bg-muted/90 px-3.5 py-3">
                  CLIENT &amp; CARGO
                </th>
                <th className="py-3 px-3.5 w-36 border-r border-border">
                  VESSEL / B/L
                </th>
                <th className="py-3 px-3 w-28 border-r border-border">
                  ICD / ARRIVAL
                </th>

                {/* 10 Pipeline Stages */}
                {PIPELINE_STAGES.map((s, idx) => (
                  <th
                    key={s.field}
                    className="py-3 px-2 min-w-[115px] border-r border-border text-center font-medium"
                  >
                    {idx + 1}. {s.shortLabel}
                  </th>
                ))}

                {/* Row Action Header */}
                <th className="py-3 px-3.5 text-center min-w-[120px] bg-muted/50">
                  ACTION
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={15}
                    className="py-12 text-center text-muted-foreground text-xs"
                  >
                    No consignments found matching your filter.
                  </td>
                </tr>
              )}

              {filteredRows.map((row) => {
                const isReleased = row.release_status === "Released";
                const isStuck = isRowStuck(row);

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    {/* Sticky REF NO Column */}
                    <td className="sticky left-0 z-20 w-[112px] min-w-[112px] border-r border-border bg-card px-3.5 py-2.5 font-mono font-bold whitespace-nowrap group-hover:bg-muted/20">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/consignments/${row.id}`}
                          className="hover:text-primary hover:underline text-foreground"
                        >
                          {row.ref_no}
                        </Link>
                        {isStuck && !isReleased && (
                          <span
                            className="text-[9px] font-bold bg-destructive/10 text-destructive border border-destructive/20 px-1 py-0.2 rounded"
                            title="Stuck > 48 hours"
                          >
                            STUCK
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Sticky Client & Cargo Column */}
                    <td className="sticky left-[112px] z-20 w-[184px] min-w-[184px] border-r border-border bg-card px-3.5 py-2.5 group-hover:bg-muted/20">
                      <div
                        className="font-semibold text-foreground truncate w-40"
                        title={row.client_name}
                      >
                        {row.client_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate w-40 mt-0.5">
                        {row.cargo_count ? `${row.cargo_count} × ` : ""}
                        {row.cargo_type ?? "—"}
                        {row.goods_description ? ` · ${row.goods_description}` : ""}
                      </div>
                    </td>

                    {/* Vessel & BL */}
                    <td className="py-2.5 px-3.5 border-r border-border text-foreground">
                      <div
                        className="font-medium text-foreground truncate w-32"
                        title={row.vessel_name ?? "—"}
                      >
                        {row.vessel_name ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {row.bl_number ?? "—"}
                      </div>
                    </td>

                    {/* ICD & Arrival */}
                    <td className="py-2.5 px-3 border-r border-border text-foreground whitespace-nowrap">
                      <div className="font-medium">
                        {row.arrival_date
                          ? new Date(row.arrival_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })
                          : row.estimated_arrival_date
                            ? `Est. ${new Date(row.estimated_arrival_date).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                              })}`
                            : "Awaiting"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {row.consignment_nature}
                      </div>
                    </td>

                    {/* 10 Pipeline Stages */}
                    {PIPELINE_STAGES.map((stage) => {
                      const currentVal = row[stage.field] as string;
                      const isDone = isStageComplete(stage.field, currentVal);
                      const isActive =
                        row.active_stage === stage.field && !isReleased;

                      if (isDone) {
                        // Completed stage (Calm Emerald Badge)
                        return (
                          <td
                            key={stage.field}
                            className="py-2 px-1.5 border-r border-border text-center"
                          >
                            <span
                              className="inline-flex items-center justify-center gap-1 w-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-2 py-1 rounded-md text-[11px] font-medium"
                              title={`${stage.label}: Completed (${currentVal})`}
                            >
                              <span>✓</span>
                              <span className="truncate">{currentVal}</span>
                            </span>
                          </td>
                        );
                      } else if (isActive) {
                        // Active stage (Interactive Amber Button)
                        return (
                          <td
                            key={stage.field}
                            className="py-2 px-1.5 border-r border-border text-center bg-amber-50/40 dark:bg-amber-950/20"
                          >
                            <button
                              type="button"
                              onClick={() => promptAdvance(row, stage.field)}
                              disabled={isPending}
                              className="inline-flex items-center justify-center gap-1 w-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 dark:border-amber-700 px-2 py-1 rounded-md text-[11px] font-semibold hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                              title={`Click to prompt and advance ${stage.label}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 inline-block shrink-0 animate-pulse" />
                              <span>Action ➔</span>
                            </button>
                          </td>
                        );
                      } else {
                        // Upcoming stage (Muted neutral)
                        return (
                          <td
                            key={stage.field}
                            className="py-2 px-1.5 border-r border-border text-center text-muted-foreground/40"
                          >
                            <span className="text-[11px] select-none">·</span>
                          </td>
                        );
                      }
                    })}

                    {/* Row Quick Action */}
                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap bg-card group-hover:bg-muted/20">
                      {isReleased ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-md">
                          ✓ Released
                        </span>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => promptAdvance(row, row.active_stage)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 bg-primary hover:opacity-90 text-primary-foreground font-medium text-[11px] px-3 py-1.5 rounded-lg transition-opacity shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                          >
                            <span>Advance</span>
                            <span className="opacity-70">➔</span>
                          </button>
                          {perms.isAdmin && (
                            <button
                              type="button"
                              onClick={() =>
                                setForceDialog({ card: row, stage: row.active_stage })
                              }
                              title="Admin: Force set stage"
                              className="text-muted-foreground hover:text-foreground text-xs p-1"
                            >
                              ⚙
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          <div>
            Showing <strong className="text-foreground">{filteredRows.length}</strong>{" "}
            consignments · Click any{" "}
            <strong className="text-amber-600 dark:text-amber-400 font-semibold">
              Action ➔
            </strong>{" "}
            button to prompt and advance that stage safely.
          </div>
          <span className="hidden shrink-0 sm:inline">Data updates live</span>
        </div>
      </div>

      {/* Confirmation safeguard dialog */}
      {pendingConfirm && (
        <StageConfirmDialog
          consignment={pendingConfirm.consignment}
          currentStage={pendingConfirm.currentStage}
          targetValue={pendingConfirm.targetValue}
          landingStage={pendingConfirm.landingStage}
          popupKind={pendingConfirm.popupKind}
          icds={icds}
          onConfirm={executeAdvance}
          onCancel={() => setPendingConfirm(null)}
          isPending={isPending}
        />
      )}

      {/* Admin force stage dialog */}
      {forceDialog && (
        <ForceStageDialog
          open
          onOpenChange={(o) => {
            if (!o) setForceDialog(null);
          }}
          consignmentId={forceDialog.card.id}
          refNo={forceDialog.card.ref_no}
          defaultStage={forceDialog.stage}
          defaultValue="Action"
          onSuccess={() => {
            setForceDialog(null);
            invalidateConsignments();
          }}
          onError={setErrorMessage}
        />
      )}
    </div>
  );
}

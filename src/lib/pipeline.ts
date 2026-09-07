/**
 * Shared pipeline constants and types.
 * Safe to import from both server and client code.
 * NOT a "use server" file — contains data, not actions.
 *
 * IMPORTANT: Status enum values come directly from the DB schema.
 * Each field has its own enum type with different terminal values.
 */

export type StageField =
  | "manifest_status"
  | "shipping_batch_status"
  | "tanesws_status"
  | "assessment_status"
  | "tbs_loading_status"
  | "tbs_debit_status"
  | "manifest_comp_status"
  | "duty_status"
  | "inspection_file_status"
  | "release_status";

/** D-071: Import runs the full pipeline; Export/Transit skip both TBS stages. */
export type ConsignmentNature = "Import" | "Export" | "Transit";

export const CONSIGNMENT_NATURES: ConsignmentNature[] = [
  "Import",
  "Export",
  "Transit",
];

/** Stages auto-skipped in the DB (and visually) for Export/Transit — D-071. */
export const TBS_SKIP_FIELDS: StageField[] = [
  "tbs_loading_status",
  "tbs_debit_status",
];

/** True when this nature skips the TBS stages. */
export function natureSkipsTbs(nature: ConsignmentNature | null | undefined): boolean {
  return nature === "Export" || nature === "Transit";
}

export type KanbanConsignment = {
  id: string;
  ref_no: string;
  year: number;
  goods_description: string | null;
  vessel_name: string | null;
  bl_number: string | null;
  arrival_date: string | null;
  estimated_arrival_date: string | null;
  consignment_nature: ConsignmentNature;
  tansad_no: string | null;
  ucr_no: string | null;
  cargo_count: number | null;
  cargo_type: string | null;
  amount: number | null;
  /** Prefills for the Release drop-popup (D-073). */
  efd_receipt_no: string | null;
  remarks: string | null;
  client_name: string;
  manifest_status: string;
  shipping_batch_status: string;
  tanesws_status: string;
  assessment_status: string;
  tbs_loading_status: string;
  tbs_debit_status: string;
  manifest_comp_status: string;
  duty_status: string;
  inspection_file_status: string;
  release_status: string;
  /** Which pipeline stage is currently the "active" one (first non-complete stage) */
  active_stage: StageField;
  updated_at: string;
};

/**
 * The "complete" value for each stage field.
 * Each status enum in the DB has a different terminal value.
 */
export const STAGE_DONE_VALUE: Record<StageField, string> = {
  manifest_status:        "Uploaded",
  shipping_batch_status:  "Done",
  tanesws_status:         "Done",
  assessment_status:      "Accepted",
  tbs_loading_status:     "Done",
  tbs_debit_status:       "Paid",
  manifest_comp_status:   "Done",
  duty_status:            "Paid",
  inspection_file_status: "Done",
  release_status:         "Released",
};

export const PIPELINE_STAGES: {
  field: StageField;
  label: string;
  shortLabel: string;
  /** All valid values for this stage's status enum */
  validValues: string[];
  /** The value that means "complete" for this stage */
  doneValue: string;
}[] = [
  {
    field: "manifest_status",
    label: "Manifest Uploaded",
    shortLabel: "Manifest",
    validValues: ["Waiting", "Action", "Uploaded"],
    doneValue: "Uploaded",
  },
  {
    // D-071: Duty Application moved ahead of Shipping Batch. Order lives here
    // (app layer), not the DB enum. advance_stage()'s only prerequisite for
    // this stage is manifest=Uploaded, which still precedes it — so the reorder
    // is safe. Entering this stage opens the Duty-Application drop-popup.
    field: "tanesws_status",
    label: "Duty Application",
    shortLabel: "Duty App",
    validValues: ["Waiting", "Action", "Done"],
    doneValue: "Done",
  },
  {
    field: "shipping_batch_status",
    label: "Shipping Batch",
    shortLabel: "Shipping",
    validValues: ["Waiting", "Action", "PREPARED", "W/CARRY IN", "CARRY IN END", "Done"],
    doneValue: "Done",
  },
  {
    field: "assessment_status",
    label: "Assessment",
    shortLabel: "Assessment",
    validValues: ["Waiting", "Action", "Accepted"],
    doneValue: "Accepted",
  },
  {
    field: "tbs_loading_status",
    label: "OGA Applications",
    shortLabel: "OGA Apps",
    validValues: ["Waiting", "Action", "Done"],
    doneValue: "Done",
  },
  {
    field: "tbs_debit_status",
    label: "OGA Debit",
    shortLabel: "OGA Debit",
    validValues: ["Waiting", "Action", "Paid", "SHARED"],
    doneValue: "Paid",
  },
  {
    field: "manifest_comp_status",
    label: "Manifest Comparison",
    shortLabel: "Mfst Comp",
    validValues: ["Waiting", "Action", "Done"],
    doneValue: "Done",
  },
  {
    field: "duty_status",
    label: "Duty",
    shortLabel: "Duty",
    validValues: ["Waiting", "Action", "Paid"],
    doneValue: "Paid",
  },
  {
    field: "inspection_file_status",
    label: "Inspection File",
    shortLabel: "Inspection",
    validValues: ["Waiting", "Action", "Done", "SHARED"],
    doneValue: "Done",
  },
  {
    field: "release_status",
    label: "Release",
    shortLabel: "Release",
    validValues: ["Waiting", "Released"],
    doneValue: "Released",
  },
];

export const STAGE_FIELDS = PIPELINE_STAGES.map((s) => s.field);

/**
 * Returns the field of the first stage that isn't at its "done" value.
 *
 * D-071: when `nature` is Export/Transit, the TBS stages are skipped — they're
 * never the active stage, matching the DB's auto-skip in advance_stage(). Pass
 * nature so the optimistic landing column + triage bucket agree with the server.
 * Omitting nature (or Import) preserves the original full-pipeline behaviour.
 */
export function resolveActiveStage(
  row: Record<string, string>,
  nature?: ConsignmentNature | null,
): StageField {
  const skip = natureSkipsTbs(nature);
  for (const stage of PIPELINE_STAGES) {
    if (skip && TBS_SKIP_FIELDS.includes(stage.field)) continue;
    if (row[stage.field] !== stage.doneValue) return stage.field;
  }
  return "release_status"; // fully released
}

/** Returns true if a stage value counts as "complete". */
export function isStageComplete(field: StageField, value: string): boolean {
  return value === STAGE_DONE_VALUE[field];
}

/**
 * Human-readable label for a consignment's currently-active pipeline stage,
 * e.g. "Duty — Action", or "Released" when fully released. Pure over the row's
 * 10 stage-status fields. Shared by the consignments list grid and the XLSX/PDF
 * exports so the "Pipeline Stage" column reads identically everywhere.
 */
export function currentStageLabel(row: Record<StageField, string>): string {
  const stageValues: Record<StageField, string> = {
    manifest_status: row.manifest_status,
    shipping_batch_status: row.shipping_batch_status,
    tanesws_status: row.tanesws_status,
    assessment_status: row.assessment_status,
    tbs_loading_status: row.tbs_loading_status,
    tbs_debit_status: row.tbs_debit_status,
    manifest_comp_status: row.manifest_comp_status,
    duty_status: row.duty_status,
    inspection_file_status: row.inspection_file_status,
    release_status: row.release_status,
  };
  const activeField = resolveActiveStage(stageValues);
  const active = PIPELINE_STAGES.find((s) => s.field === activeField);
  if (!active) return "—";

  const status = stageValues[activeField];
  if (activeField === "release_status" && status === active.doneValue) {
    return "Released";
  }
  return `${active.label} — ${status}`;
}

/**
 * Converts a `StageField` (the column name, e.g. `"manifest_status"`) to the
 * `public.pipeline_stage` DB enum value the `advance_stage()` / `force_set_stage()`
 * functions expect (e.g. `"manifest"`). The enum values are simply the field
 * names with the `_status` suffix removed.
 *
 * Per migration 20260519005500_advance_stage.sql:
 *   manifest, shipping_batch, tanesws, assessment, tbs_loading, tbs_debit,
 *   manifest_comp, duty, inspection_file, release
 */
export function stageFieldToDbEnum(field: StageField): string {
  return field.replace(/_status$/, "");
}

// Triage classifier — D-045. Drives the mobile-default / desktop-tab triage view.

export type TriageBucket = "action" | "waiting" | "done";

export type TriageClassification = {
  bucket: TriageBucket;
  /** Action-bucket row whose active stage hasn't moved in 48h+. */
  isStuck: boolean;
  /** No arrival yet — PRD §7.2 forces all stages to Waiting. */
  isAwaitingArrival: boolean;
  /** The active stage, or null if fully released. */
  activeStage: StageField | null;
  /** Human label for the row subtitle (e.g. "Duty", "Awaiting arrival"). */
  subtitleLabel: string;
};

/** Active-stage values that mean "work has started; someone owns this." */
const ACTION_INTERMEDIATE_VALUES = new Set([
  "Action",
  "PREPARED",
  "W/CARRY IN",
  "CARRY IN END",
  "SHARED",
]);

const STUCK_THRESHOLD_MS = 48 * 60 * 60 * 1000;

type ClassifiableRow = Record<StageField, string> & {
  arrival_date: string | null;
  updated_at: string;
  /** D-071: optional; when Export/Transit, TBS stages are skipped. */
  consignment_nature?: ConsignmentNature | null;
};

export function classifyConsignment(
  row: ClassifiableRow,
  now: Date = new Date(),
): TriageClassification {
  if (!row.arrival_date) {
    return {
      bucket: "waiting",
      isStuck: false,
      isAwaitingArrival: true,
      activeStage: PIPELINE_STAGES[0].field,
      subtitleLabel: "Awaiting arrival",
    };
  }

  const skip = natureSkipsTbs(row.consignment_nature);
  const stageOnly = {} as Record<string, string>;
  for (const s of PIPELINE_STAGES) stageOnly[s.field] = row[s.field];
  const activeField = resolveActiveStage(stageOnly, row.consignment_nature);
  const fullyReleased = PIPELINE_STAGES.every(
    (s) =>
      (skip && TBS_SKIP_FIELDS.includes(s.field)) ||
      row[s.field] === s.doneValue,
  );

  if (fullyReleased) {
    return {
      bucket: "done",
      isStuck: false,
      isAwaitingArrival: false,
      activeStage: null,
      subtitleLabel: "Released",
    };
  }

  const stage = PIPELINE_STAGES.find((s) => s.field === activeField)!;
  const value = row[activeField];
  const bucket: TriageBucket = ACTION_INTERMEDIATE_VALUES.has(value)
    ? "action"
    : "waiting";

  const updatedAtMs = Date.parse(row.updated_at);
  const isStuck =
    bucket === "action" &&
    Number.isFinite(updatedAtMs) &&
    now.getTime() - updatedAtMs > STUCK_THRESHOLD_MS;

  return {
    bucket,
    isStuck,
    isAwaitingArrival: false,
    activeStage: activeField,
    subtitleLabel: stage.label,
  };
}

// ── New-Consignments intake bucket + drop-popup gating — D-071 ───────────────

/**
 * The board renders a "New Consignments" column left of Manifest. A card lives
 * there while it has only intake data: manifest still Waiting AND no ACTUAL
 * arrival yet (estimated arrival doesn't count — the real one is captured at
 * the Manifest drop-popup). The DB still treats these rows as active_stage
 * `manifest_status`; this is a board-only split.
 */
export function isNewConsignment(row: {
  manifest_status: string;
  arrival_date: string | null;
}): boolean {
  return row.manifest_status === "Waiting" && !row.arrival_date;
}

/**
 * Which blocking drop-popup (if any) a transition must open before it can be
 * committed — D-071. Both popups collect real-world data discovered at that
 * step, so the advance is deferred until the operator submits.
 *
 *   - "manifest": New → Manifest. Collects actual arrival_date + icd_id, then
 *     advances manifest_status → Action.
 *   - "duty_application": entering Duty Application (tanesws). Collects
 *     tansad_no + ucr_no, then advances manifest_status → Uploaded so the card
 *     lands in the (now second) Duty Application column.
 *   - null: no popup; advance directly.
 *
 * `card` carries the current row; `dropTarget` is the column the user dropped
 * on (the New pseudo-column is reported as "__new__"); `landingStage` is where
 * resolveActiveStage says the card ends up after the forward move. Shared by
 * the kanban board and the tap-to-advance action menu so both paths gate
 * identically.
 *
 * The third kind, "release", is not reachable from this function — a release is
 * never an ordinary forward move (see isReleaseAdvance below).
 */
export type DropPopupKind = "manifest" | "duty_application" | "release";

/**
 * True when an advance is the final release — `release_status → 'Released'`.
 * D-073: this transition is gated by the Release popup (EFD receipt no, amount,
 * remarks). It's the single choke point every release path funnels through: the
 * card's "Mark Released" button, the drag-to-release drop zone, and the
 * tap-to-advance action menu.
 */
export function isReleaseAdvance(stage: StageField, newValue: string): boolean {
  return (
    stage === "release_status" && newValue === STAGE_DONE_VALUE.release_status
  );
}

/** Sentinel drop-target id for the New-Consignments pseudo-column. */
export const NEW_COLUMN_ID = "__new__";

export function gatedPopupForForwardMove(
  card: { manifest_status: string; arrival_date: string | null },
  dropTarget: StageField | typeof NEW_COLUMN_ID,
  landingStage: StageField,
): DropPopupKind | null {
  // New → Manifest: a New-bucket card dropped onto the Manifest column. Both
  // its active_stage and the target are manifest_status, so key off the New
  // predicate + the target column rather than a stage change.
  if (isNewConsignment(card) && dropTarget === "manifest_status") {
    return "manifest";
  }
  // Advancing into Duty Application (tanesws) opens the customs popup. This
  // fires whether the user drops on the Duty App column or overshoots — the
  // landing stage is what matters.
  if (landingStage === "tanesws_status" && !isNewConsignment(card)) {
    return "duty_application";
  }
  return null;
}

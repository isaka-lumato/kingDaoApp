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

export type KanbanConsignment = {
  id: string;
  ref_no: string;
  year: number;
  goods_description: string | null;
  vessel_name: string | null;
  arrival_date: string | null;
  container_count: number | null;
  container_type: string | null;
  amount: number | null;
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
  assessment_status:      "Closed",
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
    label: "Manifest",
    shortLabel: "Manifest",
    validValues: ["Waiting", "Action", "Uploaded"],
    doneValue: "Uploaded",
  },
  {
    field: "shipping_batch_status",
    label: "Shipping Batch",
    shortLabel: "Shipping",
    validValues: ["Waiting", "Action", "PREPARED", "W/CARRY IN", "CARRY IN END", "Done"],
    doneValue: "Done",
  },
  {
    field: "tanesws_status",
    label: "TANESWS",
    shortLabel: "TANESWS",
    validValues: ["Waiting", "Action", "Done"],
    doneValue: "Done",
  },
  {
    field: "assessment_status",
    label: "Assessment",
    shortLabel: "Assessment",
    validValues: ["Waiting", "Action", "Closed"],
    doneValue: "Closed",
  },
  {
    field: "tbs_loading_status",
    label: "TBS Loading",
    shortLabel: "TBS Load",
    validValues: ["Waiting", "Action", "Done"],
    doneValue: "Done",
  },
  {
    field: "tbs_debit_status",
    label: "TBS Debit",
    shortLabel: "TBS Debit",
    validValues: ["Waiting", "Action", "Paid", "SHARED"],
    doneValue: "Paid",
  },
  {
    field: "manifest_comp_status",
    label: "Manifest Comp",
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

/** Returns the field of the first stage that isn't at its "done" value. */
export function resolveActiveStage(row: Record<string, string>): StageField {
  for (const stage of PIPELINE_STAGES) {
    if (row[stage.field] !== stage.doneValue) return stage.field;
  }
  return "release_status"; // fully released
}

/** Returns true if a stage value counts as "complete". */
export function isStageComplete(field: StageField, value: string): boolean {
  return value === STAGE_DONE_VALUE[field];
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

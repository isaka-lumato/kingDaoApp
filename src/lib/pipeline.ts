/**
 * Shared pipeline constants and types.
 * Safe to import from both server and client code.
 * NOT a "use server" file — contains data, not actions.
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

export type StageValue = "Waiting" | "Action" | "Done" | "SHARED" | "PRIVATE" | "TRANSIT";

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
  /** Which pipeline stage is currently the "active" one (first non-Done stage) */
  active_stage: StageField;
  updated_at: string;
};

export const PIPELINE_STAGES: {
  field: StageField;
  label: string;
  shortLabel: string;
}[] = [
  { field: "manifest_status",        label: "Manifest",        shortLabel: "Manifest"   },
  { field: "shipping_batch_status",  label: "Shipping Batch",  shortLabel: "Shipping"   },
  { field: "tanesws_status",         label: "TANESWS",         shortLabel: "TANESWS"    },
  { field: "assessment_status",      label: "Assessment",      shortLabel: "Assessment" },
  { field: "tbs_loading_status",     label: "TBS Loading",     shortLabel: "TBS Load"   },
  { field: "tbs_debit_status",       label: "TBS Debit",       shortLabel: "TBS Debit"  },
  { field: "manifest_comp_status",   label: "Manifest Comp",   shortLabel: "Mfst Comp"  },
  { field: "duty_status",            label: "Duty",            shortLabel: "Duty"       },
  { field: "inspection_file_status", label: "Inspection File", shortLabel: "Inspection" },
  { field: "release_status",         label: "Release",         shortLabel: "Release"    },
];

export const STAGE_FIELDS = PIPELINE_STAGES.map((s) => s.field);

/** Returns the field of the first stage that isn't "Done". */
export function resolveActiveStage(row: Record<string, string>): StageField {
  for (const field of STAGE_FIELDS) {
    if (row[field] !== "Done") return field;
  }
  return "release_status"; // fully done
}

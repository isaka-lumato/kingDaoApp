"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerPermissions } from "@/lib/permissions";
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Pipeline definition ────────────────────────────────────────────────────

export const PIPELINE_STAGES: {
  field: StageField;
  label: string;
  shortLabel: string;
}[] = [
  { field: "manifest_status",        label: "Manifest",        shortLabel: "Manifest" },
  { field: "shipping_batch_status",  label: "Shipping Batch",  shortLabel: "Shipping" },
  { field: "tanesws_status",         label: "TANESWS",         shortLabel: "TANESWS" },
  { field: "assessment_status",      label: "Assessment",      shortLabel: "Assessment" },
  { field: "tbs_loading_status",     label: "TBS Loading",     shortLabel: "TBS Load" },
  { field: "tbs_debit_status",       label: "TBS Debit",       shortLabel: "TBS Debit" },
  { field: "manifest_comp_status",   label: "Manifest Comp",   shortLabel: "Mfst Comp" },
  { field: "duty_status",            label: "Duty",            shortLabel: "Duty" },
  { field: "inspection_file_status", label: "Inspection File", shortLabel: "Inspection" },
  { field: "release_status",         label: "Release",         shortLabel: "Release" },
];

const STAGE_FIELDS = PIPELINE_STAGES.map((s) => s.field);

/** Returns the field of the first stage that isn't "Done". */
function resolveActiveStage(row: Record<string, string>): StageField {
  for (const field of STAGE_FIELDS) {
    if (row[field] !== "Done") return field;
  }
  return "release_status"; // fully done
}

// ── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Fetch all active (non-deleted, not fully released) consignments for the
 * Kanban board. Returns them grouped by active_stage.
 */
export async function fetchKanbanData(year?: number): Promise<{
  byStage: Record<StageField, KanbanConsignment[]>;
  error?: string;
}> {
  const supabase = await getSupabaseServerClient();
  const targetYear = year ?? new Date().getFullYear();

  const { data, error } = await supabase
    .from("consignments")
    .select(
      `id, ref_no, year, goods_description, vessel_name, arrival_date,
       container_count, container_type, amount, updated_at,
       manifest_status, shipping_batch_status, tanesws_status,
       assessment_status, tbs_loading_status, tbs_debit_status,
       manifest_comp_status, duty_status, inspection_file_status, release_status,
       clients(name)`
    )
    .eq("year", targetYear)
    .is("deleted_at", null)
    .neq("release_status", "Done")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    return { byStage: emptyBoard(), error: error.message };
  }

  const byStage = emptyBoard();

  for (const row of data ?? []) {
    const stageValues: Record<string, string> = {
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

    const active_stage = resolveActiveStage(stageValues);
    const client = row.clients as unknown as { name: string } | null;

    byStage[active_stage].push({
      id: row.id,
      ref_no: row.ref_no,
      year: row.year,
      goods_description: row.goods_description,
      vessel_name: row.vessel_name,
      arrival_date: row.arrival_date,
      container_count: row.container_count ? Number(row.container_count) : null,
      container_type: row.container_type,
      amount: row.amount,
      client_name: client?.name ?? "—",
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
      active_stage,
      updated_at: row.updated_at,
    });
  }

  return { byStage };
}

function emptyBoard(): Record<StageField, KanbanConsignment[]> {
  const board = {} as Record<StageField, KanbanConsignment[]>;
  for (const field of STAGE_FIELDS) {
    board[field] = [];
  }
  return board;
}

// ── Mutations ──────────────────────────────────────────────────────────────

const advanceSchema = z.object({
  consignmentId: z.uuid(),
  stage: z.string(),
  newValue: z.string(),
});

/**
 * Advance a pipeline stage via the `advance_stage()` SQL function.
 * Enforces all PRD §8 prerequisites at the DB level.
 */
export async function advanceStageAction(formData: FormData) {
  const parsed = advanceSchema.safeParse({
    consignmentId: formData.get("consignmentId"),
    stage: formData.get("stage"),
    newValue: formData.get("newValue"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("advance_stage", {
    p_consignment_id: parsed.data.consignmentId,
    p_stage: parsed.data.stage,
    p_new_value: parsed.data.newValue,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}

const forceSchema = z.object({
  consignmentId: z.uuid(),
  stage: z.string(),
  newValue: z.string(),
  reason: z.string().min(1, "Reason is required for force-set"),
});

/**
 * Admin-only: force-set a stage bypassing prerequisites.
 */
export async function forceSetStageAction(formData: FormData) {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) return { error: "Admin access required" };

  const parsed = forceSchema.safeParse({
    consignmentId: formData.get("consignmentId"),
    stage: formData.get("stage"),
    newValue: formData.get("newValue"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const admin = getSupabaseAdminClient();
  const { error } = await admin.rpc("force_set_stage", {
    p_consignment_id: parsed.data.consignmentId,
    p_stage: parsed.data.stage,
    p_new_value: parsed.data.newValue,
    p_reason: parsed.data.reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}

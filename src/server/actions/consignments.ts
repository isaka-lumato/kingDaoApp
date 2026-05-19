"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerPermissions } from "@/lib/permissions";
import {
  PIPELINE_STAGES,
  STAGE_FIELDS,
  resolveActiveStage,
  type StageField,
  type KanbanConsignment,
} from "@/lib/pipeline";
import { z } from "zod";

// (Types and constants are in @/lib/pipeline — import from there in client/server components)

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyBoard(): Record<StageField, KanbanConsignment[]> {
  const board = {} as Record<StageField, KanbanConsignment[]>;
  for (const field of STAGE_FIELDS) {
    board[field] = [];
  }
  return board;
}

// ── Fetch ──────────────────────────────────────────────────────────────────

/**
 * T-040: Fetch all active consignments for the Kanban board.
 * Returns them pre-grouped by active_stage.
 */
export async function fetchKanbanData(year?: number): Promise<{
  byStage: Record<StageField, KanbanConsignment[]>;
  error?: string;
}> {
  // Use admin client so the clients(name) join bypasses RLS.
  // This is a server-only read, behind auth middleware.
  const supabase = getSupabaseAdminClient();
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
    .neq("release_status", "Released")
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

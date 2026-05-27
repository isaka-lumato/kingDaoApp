"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { z } from "zod";

// ── T-046: Duplicate consignment ──────────────────────────────────────────

export async function duplicateConsignmentAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return { error: "ID required" };

  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!perms.canWrite("consignments", "ref_no")) {
    return { error: "You do not have permission to create consignments." };
  }

  const supabase = await getSupabaseServerClient();

  // Fetch the source consignment.
  const { data: src, error: fetchErr } = await supabase
    .from("consignments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !src) return { error: "Consignment not found" };

  // Generate next serial/ref for same year.
  const { data: lastSerial } = await supabase
    .from("consignments")
    .select("serial_no")
    .eq("year", src.year)
    .order("serial_no", { ascending: false })
    .limit(1)
    .single();

  const nextSerial = (lastSerial?.serial_no ?? 0) + 1;
  const yearSuffix = String(src.year).slice(2);
  const ref_no = `${yearSuffix}${String(nextSerial).padStart(4, "0")}`;

  // Insert duplicate — clear ref_no, tansad_no, dates, reset all stages.
  const { data: newRow, error: insertErr } = await supabase
    .from("consignments")
    .insert({
      ref_no,
      serial_no: nextSerial,
      year: src.year,
      client_id: src.client_id,
      bl_number: src.bl_number,
      vessel_name: src.vessel_name,
      arrival_date: src.arrival_date,
      container_count: src.container_count,
      container_type: src.container_type,
      goods_description: src.goods_description,
      icd_id: src.icd_id,
      amount: src.amount,
      remarks: `Duplicated from ${src.ref_no}`,
      // tansad_no intentionally cleared (new clearance)
      // All stages reset to Waiting
      manifest_status: "Waiting",
      shipping_batch_status: "Waiting",
      tanesws_status: "Waiting",
      assessment_status: "Waiting",
      tbs_loading_status: "Waiting",
      tbs_debit_status: "Waiting",
      manifest_comp_status: "Waiting",
      duty_status: "Waiting",
      inspection_file_status: "Waiting",
      release_status: "Waiting",
    })
    .select("id")
    .single();

  if (insertErr) return { error: insertErr.message };

  revalidatePath("/consignments");
  revalidatePath("/");
  redirect(`/consignments/${newRow.id}`);
}

// ── T-047: Soft delete ────────────────────────────────────────────────────

const deleteSchema = z.object({
  id: z.uuid(),
  reason: z.string().min(1, "A reason is required for deletion"),
});

export async function softDeleteConsignmentAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) return { error: "Only admins can delete consignments." };

  const parsed = deleteSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await getSupabaseServerClient();

  // Log reason in remarks before soft-deleting.
  const { error } = await supabase
    .from("consignments")
    .update({
      deleted_at: new Date().toISOString(),
      remarks: `[DELETED] ${parsed.data.reason}`,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  revalidatePath("/consignments");
  revalidatePath("/");
  return { success: true };
}

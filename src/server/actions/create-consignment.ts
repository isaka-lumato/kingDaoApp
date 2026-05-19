"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { z } from "zod";

const newConsignmentSchema = z.object({
  client_id: z.uuid("Client is required"),
  year: z.coerce.number().int().min(2000).max(2100),
  bl_number: z.string().max(100).optional().or(z.literal("")),
  tansad_no: z.string().max(100).optional().or(z.literal("")),
  vessel_name: z.string().max(200).optional().or(z.literal("")),
  arrival_date: z.string().optional().or(z.literal("")),
  container_count: z.coerce.number().int().min(1).optional().or(z.literal("")),
  container_type: z.enum(["20GP", "40GP", "40HC", "LCL", "BULK"]).optional(),
  goods_description: z.string().max(1000).optional().or(z.literal("")),
  icd_id: z.uuid().optional().or(z.literal("")),
  amount: z.coerce.number().int().min(0).optional().or(z.literal("")),
  remarks: z.string().max(2000).optional().or(z.literal("")),
});

export async function createConsignmentAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string } | never> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!perms.canWrite("consignments", "ref_no")) {
    return { error: "You do not have permission to create consignments." };
  }

  const raw = Object.fromEntries(
    Array.from(formData.entries()).map(([k, v]) => [k, v === "" ? undefined : v])
  );

  const parsed = newConsignmentSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: `${first.path.join(".")}: ${first.message}` };
  }

  const d = parsed.data;
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("consignments")
    .insert({
      client_id: d.client_id,
      year: d.year,
      bl_number: d.bl_number || null,
      tansad_no: d.tansad_no || null,
      vessel_name: d.vessel_name || null,
      arrival_date: d.arrival_date || null,
      container_count: d.container_count ? Number(d.container_count) : null,
      container_type: d.container_type ?? null,
      goods_description: d.goods_description || null,
      icd_id: d.icd_id || null,
      amount: d.amount ? Number(d.amount) : null,
      remarks: d.remarks || null,
      // All stages start at Waiting
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

  if (error) return { error: error.message };

  redirect(`/consignments/${data.id}`);
}

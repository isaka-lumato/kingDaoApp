"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { z } from "zod";

const editSchema = z.object({
  id: z.uuid(),
  client_id: z.uuid().optional(),
  bl_number: z.string().max(100).nullable().optional(),
  tansad_no: z.string().max(100).nullable().optional(),
  vessel_name: z.string().max(200).nullable().optional(),
  arrival_date: z.string().nullable().optional(),
  container_count: z.coerce.number().int().min(1).nullable().optional(),
  container_type: z.enum(["20GP", "40GP", "40HC", "LCL", "BULK"]).nullable().optional(),
  goods_description: z.string().max(1000).nullable().optional(),
  icd_id: z.uuid().nullable().optional(),
  amount: z.coerce.number().int().min(0).nullable().optional(),
  remarks: z.string().max(2000).nullable().optional(),
  tansad_no_update: z.string().max(100).nullable().optional(),
});

export async function editConsignmentAction(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };

  const id = formData.get("id") as string;
  if (!id) return { error: "Consignment ID missing" };

  // Build update payload — only include fields the user can write.
  const EDITABLE_FIELDS = [
    "client_id", "bl_number", "tansad_no", "vessel_name", "arrival_date",
    "container_count", "container_type", "goods_description", "icd_id",
    "amount", "remarks",
  ] as const;

  type EditableField = typeof EDITABLE_FIELDS[number];

  const updates: Partial<Record<EditableField, unknown>> = {};

  for (const field of EDITABLE_FIELDS) {
    if (!formData.has(field)) continue;
    if (!perms.canWrite("consignments", field)) continue; // column-level guard

    const raw = formData.get(field);
    const val = raw === "" || raw === null ? null : raw;

    if (field === "container_count" || field === "amount") {
      updates[field] = val === null ? null : Number(val);
    } else {
      updates[field] = val;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { error: "No fields to update (check your permissions)." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("consignments")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/consignments/${id}`);
  revalidatePath("/consignments");
  revalidatePath("/");
  return { success: true };
}

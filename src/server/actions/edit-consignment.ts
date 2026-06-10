"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { friendlyConsignmentDbError } from "@/lib/db-errors";

// container_count and container_type are NOT NULL in the DB — never allow a
// blank edit to clear them (it would trigger a not-null constraint violation).
const NON_NULLABLE_FIELDS = new Set(["container_count", "container_type"]);

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

    // Don't push a null into a NOT-NULL column — skip the field so the
    // existing value is preserved instead of hitting a DB constraint.
    if (val === null && NON_NULLABLE_FIELDS.has(field)) continue;

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

  if (error) return { error: friendlyConsignmentDbError(error) };

  revalidatePath(`/consignments/${id}`);
  revalidatePath("/consignments");
  revalidatePath("/");
  return { success: true };
}

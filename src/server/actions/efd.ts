"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import {
  efdRecordSchema,
  consignmentIdSchema,
  normaliseFlagsFromCode,
} from "@/schemas/efd";

function canWriteEfd(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("operator");
}

// PRD §8.4 line 433: setting efd_code on one consignment must propagate to all
// siblings sharing (in_ref, client_id, year). When the user picks any
// consignment that belongs to an in_ref batch, pull in every sibling. The
// efd_record_consignments PK + ignoreDuplicates upsert make this idempotent.
async function expandToBatchSiblings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  consignmentIds: string[]
): Promise<string[]> {
  if (consignmentIds.length === 0) return [];

  const { data: anchors } = await supabase
    .from("consignments")
    .select("id, in_ref, client_id, year")
    .in("id", consignmentIds);

  const tuples = new Map<string, { in_ref: string; client_id: string; year: number }>();
  for (const a of anchors ?? []) {
    if (a.in_ref && a.client_id && a.year != null) {
      tuples.set(`${a.in_ref}|${a.client_id}|${a.year}`, {
        in_ref: a.in_ref,
        client_id: a.client_id,
        year: a.year,
      });
    }
  }

  if (tuples.size === 0) return Array.from(new Set(consignmentIds));

  const expanded = new Set<string>(consignmentIds);
  for (const t of tuples.values()) {
    const { data: siblings } = await supabase
      .from("consignments")
      .select("id")
      .eq("in_ref", t.in_ref)
      .eq("client_id", t.client_id)
      .eq("year", t.year)
      .is("deleted_at", null);
    for (const s of siblings ?? []) expanded.add(s.id);
  }
  return Array.from(expanded);
}

async function recomputeIsShared(efdId: string) {
  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from("efd_record_consignments")
    .select("efd_record_id", { count: "exact", head: true })
    .eq("efd_record_id", efdId);

  const isShared = (count ?? 0) >= 2;
  await supabase
    .from("efd_records")
    .update({ is_shared: isShared })
    .eq("id", efdId);
}

function revalidateAll(efdId?: string) {
  revalidatePath("/efd");
  if (efdId) revalidatePath(`/efd/${efdId}`);
  revalidatePath("/consignments");
}

// ---------------------------------------------------------------------------
// Create

export async function createEfdAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string } | never> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!canWriteEfd(perms.roles)) {
    return { error: "You do not have permission to create EFD records." };
  }

  const raw = {
    efd_code: formData.get("efd_code") ?? "",
    efd_time: formData.get("efd_time") ?? "",
    is_private: formData.get("is_private") === "on",
    is_transit: formData.get("is_transit") === "on",
    is_shared: formData.get("is_shared") === "on",
    notes: formData.get("notes") ?? "",
  };

  const parsed = efdRecordSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: `${first.path.join(".")}: ${first.message}` };
  }
  const d = parsed.data;

  const consignmentIds = formData.getAll("consignment_ids").map(String).filter(Boolean);
  for (const cid of consignmentIds) {
    const check = consignmentIdSchema.safeParse(cid);
    if (!check.success) return { error: `Invalid consignment id: ${cid}` };
  }

  const flags = normaliseFlagsFromCode(d.efd_code, {
    is_private: d.is_private,
    is_transit: d.is_transit,
  });

  const supabase = await getSupabaseServerClient();

  // Auto-expand to in_ref batch siblings before linking (PRD §8.4).
  const expandedIds = await expandToBatchSiblings(supabase, consignmentIds);

  const { data: inserted, error: insertError } = await supabase
    .from("efd_records")
    .insert({
      efd_code: d.efd_code,
      efd_time: d.efd_time && d.efd_time !== "" ? d.efd_time : null,
      is_private: flags.is_private,
      is_transit: flags.is_transit,
      is_shared: expandedIds.length >= 2,
      notes: d.notes ? String(d.notes) : null,
      created_by: perms.userId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Failed to create EFD record" };
  }

  if (expandedIds.length > 0) {
    const rows = expandedIds.map((cid) => ({
      efd_record_id: inserted.id,
      consignment_id: cid,
      linked_by: perms.userId,
    }));
    const { error: linkError } = await supabase
      .from("efd_record_consignments")
      .upsert(rows, {
        onConflict: "efd_record_id,consignment_id",
        ignoreDuplicates: true,
      });
    if (linkError) {
      return { error: `EFD created but linking failed: ${linkError.message}` };
    }
  }

  revalidateAll(inserted.id);
  redirect(`/efd/${inserted.id}`);
}

// ---------------------------------------------------------------------------
// Update (record only — links have their own actions)

export async function updateEfdAction(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!canWriteEfd(perms.roles)) {
    return { error: "You do not have permission to edit EFD records." };
  }

  const id = String(formData.get("id") ?? "");
  if (!consignmentIdSchema.safeParse(id).success) {
    return { error: "Invalid EFD id" };
  }

  const raw = {
    efd_code: formData.get("efd_code") ?? "",
    efd_time: formData.get("efd_time") ?? "",
    is_private: formData.get("is_private") === "on",
    is_transit: formData.get("is_transit") === "on",
    is_shared: formData.get("is_shared") === "on",
    notes: formData.get("notes") ?? "",
  };

  const parsed = efdRecordSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: `${first.path.join(".")}: ${first.message}` };
  }
  const d = parsed.data;
  const flags = normaliseFlagsFromCode(d.efd_code, {
    is_private: d.is_private,
    is_transit: d.is_transit,
  });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("efd_records")
    .update({
      efd_code: d.efd_code,
      efd_time: d.efd_time && d.efd_time !== "" ? d.efd_time : null,
      is_private: flags.is_private,
      is_transit: flags.is_transit,
      notes: d.notes ? String(d.notes) : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Recompute is_shared in case the user toggled it manually — keep it in sync
  // with link count as the source of truth.
  await recomputeIsShared(id);

  revalidateAll(id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete (admin only)

export async function deleteEfdAction(efdId: string): Promise<{ error?: string }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!perms.isAdmin) return { error: "Admin only." };
  if (!consignmentIdSchema.safeParse(efdId).success) {
    return { error: "Invalid EFD id" };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("efd_records").delete().eq("id", efdId);
  if (error) return { error: error.message };

  revalidateAll();
  redirect("/efd");
}

// ---------------------------------------------------------------------------
// Link / unlink

const linkSchema = z.object({
  efd_id: consignmentIdSchema,
  consignment_ids: z.array(consignmentIdSchema).min(1, "Pick at least one consignment"),
});

export async function linkConsignmentsAction(
  efdId: string,
  consignmentIds: string[]
): Promise<{ error?: string; success?: boolean }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!canWriteEfd(perms.roles)) return { error: "Permission denied." };

  const parsed = linkSchema.safeParse({ efd_id: efdId, consignment_ids: consignmentIds });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await getSupabaseServerClient();

  // PRD §8.4: pull in batch siblings when any selected consignment has in_ref.
  const expandedIds = await expandToBatchSiblings(
    supabase,
    parsed.data.consignment_ids
  );

  const rows = expandedIds.map((cid) => ({
    efd_record_id: parsed.data.efd_id,
    consignment_id: cid,
    linked_by: perms.userId,
  }));

  // The PK on (efd_record_id, consignment_id) makes upsert idempotent.
  const { error } = await supabase
    .from("efd_record_consignments")
    .upsert(rows, { onConflict: "efd_record_id,consignment_id", ignoreDuplicates: true });

  if (error) return { error: error.message };

  await recomputeIsShared(parsed.data.efd_id);
  revalidateAll(parsed.data.efd_id);
  return { success: true };
}

export async function unlinkConsignmentAction(
  efdId: string,
  consignmentId: string
): Promise<{ error?: string; success?: boolean }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!canWriteEfd(perms.roles)) return { error: "Permission denied." };

  if (!consignmentIdSchema.safeParse(efdId).success) return { error: "Invalid EFD id" };
  if (!consignmentIdSchema.safeParse(consignmentId).success) {
    return { error: "Invalid consignment id" };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("efd_record_consignments")
    .delete()
    .eq("efd_record_id", efdId)
    .eq("consignment_id", consignmentId);

  if (error) return { error: error.message };

  await recomputeIsShared(efdId);
  revalidateAll(efdId);
  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { ATTACHMENT_BUCKET } from "@/schemas/attachment";
import {
  createFolderSchema,
  renameFolderSchema,
  deleteFolderSchema,
  type CreateFolderInput,
  type RenameFolderInput,
  type DeleteFolderInput,
} from "@/schemas/folder";

// ── Shared types ────────────────────────────────────────────────────────────

export type FolderRow = {
  id: string;
  consignment_id: string;
  parent_folder_id: string | null;
  name: string;
  uploaded_by: string | null;
  created_at: string;
};

const FOLDER_COLUMNS =
  "id, consignment_id, parent_folder_id, name, uploaded_by, created_at";

function isOperatorOrAdmin(perms: { isAdmin: boolean; roles: string[] }): boolean {
  return perms.isAdmin || perms.roles.includes("operator");
}

// ── Create a folder (operator + admin) ───────────────────────────────────────

export async function createFolderAction(
  input: CreateFolderInput,
): Promise<{ error: string } | { success: true; folder: FolderRow }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!isOperatorOrAdmin(perms)) {
    return { error: "You do not have permission to create folders." };
  }

  const parsed = createFolderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid folder" };
  }
  const { consignmentId, parentFolderId, name } = parsed.data;

  const supabase = await getSupabaseServerClient();

  // Confirm the consignment exists and is not soft-deleted.
  const { data: consignment, error: cErr } = await supabase
    .from("consignments")
    .select("id")
    .eq("id", consignmentId)
    .is("deleted_at", null)
    .single();
  if (cErr || !consignment) return { error: "Consignment not found" };

  // If nesting under a parent, the parent must belong to the same consignment
  // and be live — prevents building a tree across consignments.
  if (parentFolderId) {
    const { data: parent, error: pErr } = await supabase
      .from("consignment_folders")
      .select("id, consignment_id")
      .eq("id", parentFolderId)
      .is("deleted_at", null)
      .single();
    if (pErr || !parent) return { error: "Parent folder not found" };
    if (parent.consignment_id !== consignmentId) {
      return { error: "Parent folder belongs to a different consignment." };
    }
  }

  const { data: row, error: insErr } = await supabase
    .from("consignment_folders")
    .insert({
      consignment_id: consignmentId,
      parent_folder_id: parentFolderId,
      name,
      uploaded_by: perms.userId,
    })
    .select(FOLDER_COLUMNS)
    .single();

  if (insErr || !row) {
    // 23505 = unique_violation on (consignment, parent, name) where live.
    if (insErr?.code === "23505") {
      return { error: "A folder with this name already exists here." };
    }
    return { error: insErr?.message ?? "Failed to create folder" };
  }

  revalidatePath(`/consignments/${consignmentId}`);
  return { success: true, folder: row as FolderRow };
}

// ── Rename a folder (admin only) ─────────────────────────────────────────────

export async function renameFolderAction(
  input: RenameFolderInput,
): Promise<{ error: string } | { success: true; folder: FolderRow }> {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) return { error: "Only admins can rename folders." };

  const parsed = renameFolderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid folder name" };
  }
  const { folderId, name } = parsed.data;

  const supabase = await getSupabaseServerClient();

  const { data: row, error: updErr } = await supabase
    .from("consignment_folders")
    .update({ name })
    .eq("id", folderId)
    .is("deleted_at", null)
    .select(FOLDER_COLUMNS)
    .single();

  if (updErr || !row) {
    if (updErr?.code === "23505") {
      return { error: "A folder with this name already exists here." };
    }
    return { error: updErr?.message ?? "Folder not found" };
  }

  revalidatePath(`/consignments/${row.consignment_id}`);
  return { success: true, folder: row as FolderRow };
}

// ── Delete a folder + its whole subtree (admin only, soft-delete) ─────────────
//
// Recursively collects descendant folders, soft-deletes every folder and every
// attachment in the subtree, then best-effort removes the attachment bytes from
// Storage. Soft-delete is the authoritative "gone" signal (D-015); a Storage
// removal failure leaves harmless orphan objects (no live row references them).

export async function deleteFolderAction(
  input: DeleteFolderInput,
): Promise<{ error: string } | { success: true }> {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) return { error: "Only admins can delete folders." };

  const parsed = deleteFolderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid folder" };
  }
  const { folderId } = parsed.data;

  const supabase = await getSupabaseServerClient();

  const { data: root, error: fErr } = await supabase
    .from("consignment_folders")
    .select("id, consignment_id")
    .eq("id", folderId)
    .is("deleted_at", null)
    .single();
  if (fErr || !root) return { error: "Folder not found" };

  // Walk down from this folder, scoped to its consignment, to collect the whole
  // live subtree. Bounded by the consignment's folder count (small), so a simple
  // breadth-first expansion in app code is fine and avoids a recursive CTE.
  const { data: allFolders, error: listErr } = await supabase
    .from("consignment_folders")
    .select("id, parent_folder_id")
    .eq("consignment_id", root.consignment_id)
    .is("deleted_at", null);
  if (listErr) return { error: listErr.message };

  const childrenByParent = new Map<string, string[]>();
  for (const f of allFolders ?? []) {
    const key = f.parent_folder_id ?? "";
    const arr = childrenByParent.get(key);
    if (arr) arr.push(f.id);
    else childrenByParent.set(key, [f.id]);
  }

  const subtree: string[] = [];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    subtree.push(id);
    const kids = childrenByParent.get(id);
    if (kids) queue.push(...kids);
  }

  const nowIso = new Date().toISOString();

  // Collect the attachments in the subtree first (need their storage paths for
  // byte cleanup), then soft-delete them.
  const { data: files, error: filesErr } = await supabase
    .from("attachments")
    .select("id, storage_path")
    .in("folder_id", subtree)
    .is("deleted_at", null);
  if (filesErr) return { error: filesErr.message };

  if (files && files.length > 0) {
    const { error: fileDelErr } = await supabase
      .from("attachments")
      .update({ deleted_at: nowIso })
      .in("folder_id", subtree)
      .is("deleted_at", null);
    if (fileDelErr) return { error: fileDelErr.message };
  }

  // Soft-delete the folders themselves.
  const { error: folderDelErr } = await supabase
    .from("consignment_folders")
    .update({ deleted_at: nowIso })
    .in("id", subtree)
    .is("deleted_at", null);
  if (folderDelErr) return { error: folderDelErr.message };

  // Best-effort byte removal. A failure here is non-fatal (orphan objects only).
  if (files && files.length > 0) {
    const paths = files.map((f) => f.storage_path);
    const { error: rmErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove(paths);
    if (rmErr) {
      console.error("[folders] subtree object removal failed:", rmErr.message);
    }
  }

  revalidatePath(`/consignments/${root.consignment_id}`);
  return { success: true };
}

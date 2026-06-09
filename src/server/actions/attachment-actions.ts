"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import {
  ALLOWED_ATTACHMENT_MIME,
  ATTACHMENT_BUCKET,
  ATTACHMENT_PATH_PREFIX,
  MAX_ATTACHMENT_BYTES,
  recordAttachmentSchema,
  type RecordAttachmentInput,
} from "@/schemas/attachment";

// ── Shared types ────────────────────────────────────────────────────────────

export type AttachmentRow = {
  id: string;
  consignment_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

const ATTACHMENT_COLUMNS =
  "id, consignment_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at";

function isOperatorOrAdmin(perms: { isAdmin: boolean; roles: string[] }): boolean {
  return perms.isAdmin || perms.roles.includes("operator");
}

// ── Record an uploaded attachment (T-089) ────────────────────────────────────
//
// The browser uploads the bytes directly to Storage first (RLS-gated), then
// calls this to insert the metadata row. Upload-then-record ordering means we
// never persist a row pointing at a missing object. If this fails, the client
// removes the just-uploaded object (best-effort orphan cleanup).

export async function recordAttachmentAction(
  input: RecordAttachmentInput
): Promise<{ error: string } | { success: true; attachment: AttachmentRow }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };
  if (!isOperatorOrAdmin(perms)) {
    return { error: "You do not have permission to attach files." };
  }

  const parsed = recordAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid attachment" };
  }
  const { consignmentId, storagePath, fileName, mimeType, sizeBytes } = parsed.data;

  // Defense in depth beyond zod: the path must live under this consignment's
  // prefix, and MIME/size must be within bounds.
  const expectedPrefix = `${ATTACHMENT_PATH_PREFIX}/${consignmentId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return { error: "Storage path is not scoped to this consignment." };
  }
  if (!ALLOWED_ATTACHMENT_MIME.includes(mimeType)) {
    return { error: "Unsupported file type." };
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { error: "File exceeds the 10 MB limit." };
  }

  const supabase = await getSupabaseServerClient();

  // Confirm the consignment exists and is not soft-deleted (RLS already hides
  // deleted rows from non-admins, but be explicit).
  const { data: consignment, error: cErr } = await supabase
    .from("consignments")
    .select("id")
    .eq("id", consignmentId)
    .is("deleted_at", null)
    .single();
  if (cErr || !consignment) return { error: "Consignment not found" };

  const { data: row, error: insErr } = await supabase
    .from("attachments")
    .insert({
      consignment_id: consignmentId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: perms.userId,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();

  if (insErr || !row) return { error: insErr?.message ?? "Failed to record attachment" };

  revalidatePath(`/consignments/${consignmentId}`);
  return { success: true, attachment: row as AttachmentRow };
}

// ── Mint a short-lived signed download URL (any viewer+) ──────────────────────

export async function getAttachmentUrlAction(
  attachmentId: string
): Promise<{ error: string } | { url: string }> {
  const perms = await getServerPermissions();
  if (!perms) return { error: "Not authenticated" };

  const supabase = await getSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("attachments")
    .select("id, storage_path, file_name")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .single();
  if (error || !row) return { error: "Attachment not found" };

  const { data: signed, error: signErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.storage_path, 60, { download: row.file_name });

  if (signErr || !signed?.signedUrl) {
    return { error: signErr?.message ?? "Could not create download link" };
  }
  return { url: signed.signedUrl };
}

// ── Soft-delete an attachment (admins only, D-015) ────────────────────────────

export async function deleteAttachmentAction(
  attachmentId: string
): Promise<{ error: string } | { success: true }> {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) return { error: "Only admins can delete attachments." };

  const supabase = await getSupabaseServerClient();

  const { data: row, error: fErr } = await supabase
    .from("attachments")
    .select("id, storage_path, consignment_id")
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .single();
  if (fErr || !row) return { error: "Attachment not found" };

  // Soft-delete the row first — it is the authoritative "gone" signal (the
  // list filters deleted_at is null).
  const { error: updErr } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .is("deleted_at", null);
  if (updErr) return { error: updErr.message };

  // Then remove the bytes, best-effort. A failure here leaves a harmless orphan
  // object (no row references it); we don't fail the whole delete for it.
  const { error: rmErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([row.storage_path]);
  if (rmErr) {
    console.error("[attachments] object removal failed:", rmErr.message, row.storage_path);
  }

  revalidatePath(`/consignments/${row.consignment_id}`);
  return { success: true };
}

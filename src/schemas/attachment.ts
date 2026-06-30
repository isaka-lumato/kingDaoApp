import { z } from "zod";

// Shared client + server constants. Lives outside any "use server" module so
// both the upload UI (pre-flight validation) and the server action
// (re-validation) can import it — per D-027.

/**
 * MIME types accepted for consignment attachments: images, PDF, Word, plain
 * text, and Excel (D-055; widened from the original images + PDF set in D-054).
 * Must stay in sync with the bucket's allowed_mime_types (the un-bypassable
 * Storage-side guard) set in the 20260622220000_consignment_folders migration.
 */
export const ALLOWED_ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AttachmentMime = (typeof ALLOWED_ATTACHMENT_MIME)[number];

/** 10 MiB hard cap. Mirrors the Storage bucket file_size_limit + table CHECK. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * `accept` attribute value for the file <input>. Includes both the MIME types
 * and file extensions — some OSes report an empty `file.type` for Office
 * formats, so the extension hints keep them selectable in the picker.
 */
export const ATTACHMENT_ACCEPT = [
  ...ALLOWED_ATTACHMENT_MIME,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
].join(",");

/** Storage path prefix all attachment objects live under (storage RLS scopes to it). */
export const ATTACHMENT_PATH_PREFIX = "consignments";

/** Private Storage bucket holding attachment bytes. */
export const ATTACHMENT_BUCKET = "consignment-attachments";

export const recordAttachmentSchema = z.object({
  consignmentId: z.uuid(),
  // null = consignment root; a uuid = a consignment_folders row (D-055).
  folderId: z.uuid().nullable().default(null),
  storagePath: z.string().min(1).max(1024),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_ATTACHMENT_MIME),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});

export type RecordAttachmentInput = z.infer<typeof recordAttachmentSchema>;

/**
 * Make an arbitrary filename safe for a Storage object key: collapse anything
 * outside [A-Za-z0-9._-] to "_" and cap the length. The display name is stored
 * separately in attachments.file_name, so cosmetic loss here is harmless.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 200) || "file";
}

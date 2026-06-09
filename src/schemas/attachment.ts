import { z } from "zod";

// Shared client + server constants. Lives outside any "use server" module so
// both the upload UI (pre-flight validation) and the server action
// (re-validation) can import it — per D-027.

/** MIME types accepted for consignment attachments: images + PDF (D-054). */
export const ALLOWED_ATTACHMENT_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export type AttachmentMime = (typeof ALLOWED_ATTACHMENT_MIME)[number];

/** 10 MiB hard cap. Mirrors the Storage bucket file_size_limit + table CHECK. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** `accept` attribute value for the file <input>. */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_MIME.join(",");

/** Storage path prefix all attachment objects live under (storage RLS scopes to it). */
export const ATTACHMENT_PATH_PREFIX = "consignments";

/** Private Storage bucket holding attachment bytes. */
export const ATTACHMENT_BUCKET = "consignment-attachments";

export const recordAttachmentSchema = z.object({
  consignmentId: z.uuid(),
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

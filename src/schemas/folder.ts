import { z } from "zod";

// Shared client + server constants for the consignment folder tree (D-055).
// Lives outside any "use server" module so both the UI (pre-flight validation)
// and the server actions (re-validation) can import it — per D-027.

/** Max folder name length. Mirrors the DB CHECK (char_length(trim(name)) <= 120). */
export const MAX_FOLDER_NAME = 120;

/**
 * Normalize a folder name for storage + comparison: trim outer whitespace and
 * collapse internal runs to single spaces. The uniqueness constraint compares
 * the stored value, so normalizing here keeps "A  B" and "A B" from coexisting.
 */
export function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

const folderNameSchema = z
  .string()
  .min(1, "Folder name is required.")
  .transform(normalizeFolderName)
  .pipe(
    z
      .string()
      .min(1, "Folder name is required.")
      .max(MAX_FOLDER_NAME, `Folder name must be ${MAX_FOLDER_NAME} characters or fewer.`)
      // Storage object keys use "/" as the path separator; disallow it (and the
      // control chars) in folder names so a name can never imply nesting.
      .regex(/^[^/\\]+$/, "Folder name cannot contain slashes."),
  );

export const createFolderSchema = z.object({
  consignmentId: z.uuid(),
  parentFolderId: z.uuid().nullable().default(null),
  name: folderNameSchema,
});

export const renameFolderSchema = z.object({
  folderId: z.uuid(),
  name: folderNameSchema,
});

export const deleteFolderSchema = z.object({
  folderId: z.uuid(),
});

export const moveAttachmentSchema = z.object({
  attachmentId: z.uuid(),
  // null = move to the consignment root.
  folderId: z.uuid().nullable().default(null),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type DeleteFolderInput = z.infer<typeof deleteFolderSchema>;
export type MoveAttachmentInput = z.infer<typeof moveAttachmentSchema>;

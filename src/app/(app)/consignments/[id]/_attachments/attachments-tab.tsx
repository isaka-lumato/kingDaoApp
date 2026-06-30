"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  FileText,
  Image as ImageIcon,
  FileType,
  Sheet,
  Folder,
  FolderPlus,
  ChevronRight,
  Download,
  Trash2,
  Upload,
  Loader2,
  Pencil,
  FolderInput,
  X,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ALLOWED_ATTACHMENT_MIME,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_BUCKET,
  ATTACHMENT_PATH_PREFIX,
  MAX_ATTACHMENT_BYTES,
  sanitizeFileName,
  type AttachmentMime,
} from "@/schemas/attachment";
import {
  recordAttachmentAction,
  getAttachmentUrlAction,
  deleteAttachmentAction,
  moveAttachmentAction,
  type AttachmentRow,
} from "@/server/actions/attachment-actions";
import {
  createFolderAction,
  renameFolderAction,
  deleteFolderAction,
  type FolderRow,
} from "@/server/actions/folder-actions";

type Props = {
  consignmentId: string;
  initialFiles: AttachmentRow[];
  initialFolders: FolderRow[];
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAllowedMime(t: string): t is AttachmentMime {
  return (ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(t);
}

/** Pick an icon for a file by MIME type. */
function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="size-5" />;
  if (mime === "application/pdf") return <FileType className="size-5" />;
  if (
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return <Sheet className="size-5" />;
  return <FileText className="size-5" />;
}

export default function AttachmentsTab({
  consignmentId,
  initialFiles,
  initialFolders,
}: Props) {
  const { isAdmin, roles } = usePermissions();
  const canUpload = isAdmin || roles.includes("operator");

  const [files, setFiles] = useState<AttachmentRow[]>(initialFiles);
  const [folders, setFolders] = useState<FolderRow[]>(initialFolders);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startMutation] = useTransition();

  // New-folder + rename inline editors.
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Which file's "move to…" menu is open.
  const [movingId, setMovingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Derived: folders + files in the current folder, and the breadcrumb path ─
  const childFolders = useMemo(
    () => folders.filter((f) => f.parent_folder_id === currentFolderId),
    [folders, currentFolderId],
  );
  const folderFiles = useMemo(
    () => files.filter((f) => f.folder_id === currentFolderId),
    [files, currentFolderId],
  );

  const breadcrumb = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const trail: FolderRow[] = [];
    let cursor = currentFolderId;
    while (cursor) {
      const f = byId.get(cursor);
      if (!f) break;
      trail.unshift(f);
      cursor = f.parent_folder_id;
    }
    return trail;
  }, [folders, currentFolderId]);

  // ── Upload into the current folder ──────────────────────────────────────────
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setUploading(true);
    const supabase = getSupabaseBrowserClient();
    const added: AttachmentRow[] = [];

    try {
      for (const file of Array.from(fileList)) {
        if (!isAllowedMime(file.type)) {
          setError(
            `"${file.name}" is not a supported type (image, PDF, Word, Excel, or text).`,
          );
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`"${file.name}" exceeds the 10 MB limit.`);
          continue;
        }

        const path = `${ATTACHMENT_PATH_PREFIX}/${consignmentId}/${crypto.randomUUID()}-${sanitizeFileName(
          file.name,
        )}`;

        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(`Upload of "${file.name}" failed: ${upErr.message}`);
          continue;
        }

        const res = await recordAttachmentAction({
          consignmentId,
          folderId: currentFolderId,
          storagePath: path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });

        if ("error" in res) {
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
          setError(`Could not save "${file.name}": ${res.error}`);
          continue;
        }
        added.push(res.attachment);
      }

      if (added.length > 0) {
        setFiles((prev) => [...added.reverse(), ...prev]);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    const res = await getAttachmentUrlAction(id);
    setBusyId(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function handleDeleteFile(id: string) {
    if (!window.confirm("Delete this file? This can be restored by an admin.")) {
      return;
    }
    setError(null);
    setBusyId(id);
    startMutation(async () => {
      const res = await deleteAttachmentAction(id);
      setBusyId(null);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setFiles((prev) => prev.filter((a) => a.id !== id));
    });
  }

  // ── Create a folder in the current folder ───────────────────────────────────
  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      return;
    }
    setError(null);
    startMutation(async () => {
      const res = await createFolderAction({
        consignmentId,
        parentFolderId: currentFolderId,
        name,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setFolders((prev) => [...prev, res.folder]);
      setNewFolderName("");
      setCreatingFolder(false);
    });
  }

  function handleRenameFolder(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    setError(null);
    startMutation(async () => {
      const res = await renameFolderAction({ folderId: id, name });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setFolders((prev) => prev.map((f) => (f.id === id ? res.folder : f)));
      setRenamingId(null);
    });
  }

  function handleDeleteFolder(id: string, name: string) {
    if (
      !window.confirm(
        `Delete folder "${name}" and everything inside it? This can be restored by an admin.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusyId(id);
    startMutation(async () => {
      const res = await deleteFolderAction({ folderId: id });
      setBusyId(null);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // Drop the deleted folder + its whole subtree, and any files inside them.
      const removed = new Set<string>();
      const queue = [id];
      while (queue.length > 0) {
        const fid = queue.shift()!;
        removed.add(fid);
        for (const f of folders) {
          if (f.parent_folder_id === fid) queue.push(f.id);
        }
      }
      setFolders((prev) => prev.filter((f) => !removed.has(f.id)));
      setFiles((prev) => prev.filter((a) => !(a.folder_id && removed.has(a.folder_id))));
    });
  }

  function handleMoveFile(attachmentId: string, folderId: string | null) {
    setError(null);
    setMovingId(null);
    setBusyId(attachmentId);
    startMutation(async () => {
      const res = await moveAttachmentAction({ attachmentId, folderId });
      setBusyId(null);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // The file leaves the current view (moved elsewhere); update its row.
      setFiles((prev) =>
        prev.map((a) => (a.id === attachmentId ? res.attachment : a)),
      );
    });
  }

  // Folders a file can be moved to: all folders except… well, any folder is
  // valid (files have no children), plus "root".
  const moveTargets = useMemo(
    () => [{ id: null as string | null, name: "Root" }, ...folders.map((f) => ({ id: f.id, name: f.name }))],
    [folders],
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm min-w-0">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className={`rounded px-1.5 py-0.5 font-medium hover:bg-muted transition-colors ${
              currentFolderId === null ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Files
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1 min-w-0">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
              <button
                type="button"
                onClick={() => setCurrentFolderId(f.id)}
                className={`truncate rounded px-1.5 py-0.5 font-medium hover:bg-muted transition-colors ${
                  currentFolderId === f.id ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </nav>

        {canUpload && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(true);
                setNewFolderName("");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <FolderPlus className="size-3.5" />
              New folder
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
              disabled={uploading}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        )}
      </div>

      {canUpload && (
        <p className="-mt-2 px-1 text-xs text-muted-foreground">
          Images, PDF, Word, Excel, or text · up to 10 MB each
        </p>
      )}

      {/* Inline new-folder editor */}
      {creatingFolder && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card px-3 py-2">
          <Folder className="size-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") setCreatingFolder(false);
            }}
            placeholder="Folder name"
            maxLength={120}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            onClick={handleCreateFolder}
            className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreatingFolder(false)}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Empty state */}
      {childFolders.length === 0 && folderFiles.length === 0 && !creatingFolder ? (
        <p className="px-1 text-sm italic text-muted-foreground">
          {currentFolderId === null
            ? "No files or folders yet."
            : "This folder is empty."}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Folder grid */}
          {childFolders.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {childFolders.map((f) => {
                const busy = busyId === f.id;
                const isRenaming = renamingId === f.id;
                return (
                  <div
                    key={f.id}
                    className="group relative flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-brand/40"
                  >
                    <Folder className="size-5 shrink-0 text-brand" />
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameFolder(f.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => handleRenameFolder(f.id)}
                        maxLength={120}
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCurrentFolderId(f.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground"
                        title={f.name}
                      >
                        {f.name}
                      </button>
                    )}
                    {busy && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                    {isAdmin && !isRenaming && !busy && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(f.id);
                            setRenameValue(f.name);
                          }}
                          title="Rename"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFolder(f.id, f.name)}
                          title="Delete folder"
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* File list */}
          {folderFiles.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {folderFiles.map((a) => {
                const busy = busyId === a.id;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="shrink-0 text-muted-foreground">
                      <FileIcon mime={a.mime_type} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{a.file_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(a.size_bytes)} · {formatDate(a.created_at)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDownload(a.id)}
                      disabled={busy}
                      title="Download"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      Download
                    </button>

                    {isAdmin && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMovingId(movingId === a.id ? null : a.id)}
                          disabled={busy}
                          title="Move to folder"
                          className="inline-flex items-center justify-center rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                        >
                          <FolderInput className="size-3.5" />
                        </button>
                        {movingId === a.id && (
                          <div className="absolute right-0 top-full z-10 mt-1 max-h-56 w-44 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md">
                            {moveTargets
                              .filter((t) => t.id !== a.folder_id)
                              .map((t) => (
                                <button
                                  key={t.id ?? "root"}
                                  type="button"
                                  onClick={() => handleMoveFile(a.id, t.id)}
                                  className="block w-full truncate px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                                >
                                  {t.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(a.id)}
                        disabled={busy}
                        title="Delete"
                        className="inline-flex items-center justify-center rounded-lg border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import {
  FileText,
  Image as ImageIcon,
  Download,
  Trash2,
  Upload,
  Loader2,
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
  type AttachmentRow,
} from "@/server/actions/attachment-actions";

type Props = {
  consignmentId: string;
  initial: AttachmentRow[];
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

export default function AttachmentsTab({ consignmentId, initial }: Props) {
  const { isAdmin, roles } = usePermissions();
  const canUpload = isAdmin || roles.includes("operator");

  const [items, setItems] = useState<AttachmentRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const supabase = getSupabaseBrowserClient();
    const added: AttachmentRow[] = [];

    try {
      for (const file of Array.from(files)) {
        // Client-side validation — reject before any network call.
        if (!isAllowedMime(file.type)) {
          setError(`"${file.name}" is not a supported type (images or PDF only).`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`"${file.name}" exceeds the 10 MB limit.`);
          continue;
        }

        const path = `${ATTACHMENT_PATH_PREFIX}/${consignmentId}/${crypto.randomUUID()}-${sanitizeFileName(
          file.name
        )}`;

        // 1. Upload bytes directly to Storage (RLS-gated by the user JWT).
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(`Upload of "${file.name}" failed: ${upErr.message}`);
          continue;
        }

        // 2. Record the metadata row.
        const res = await recordAttachmentAction({
          consignmentId,
          storagePath: path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });

        if ("error" in res) {
          // Orphan cleanup — remove the just-uploaded object best-effort.
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
          setError(`Could not save "${file.name}": ${res.error}`);
          continue;
        }
        added.push(res.attachment);
      }

      if (added.length > 0) {
        // Newest first, matching the server-side ordering.
        setItems((prev) => [...added.reverse(), ...prev]);
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

  function handleDelete(id: string) {
    if (!window.confirm("Delete this attachment? This can be restored by an admin.")) {
      return;
    }
    setError(null);
    setBusyId(id);
    startDelete(async () => {
      const res = await deleteAttachmentAction(id);
      setBusyId(null);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((a) => a.id !== id));
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Upload control — operators + admins only */}
      {canUpload && (
        <section className="rounded-xl border border-dashed border-border bg-card p-5">
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
            disabled={uploading}
          />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Uploading…" : "Upload files"}
            </button>
            <p className="text-xs text-muted-foreground">
              Images (JPG, PNG, WebP, HEIC) or PDF · up to 10 MB each
            </p>
          </div>
        </section>
      )}

      {/* File list */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic px-1">
          No files attached yet.
        </p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {items.map((a) => {
            const isImage = a.mime_type.startsWith("image/");
            const busy = busyId === a.id;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <span className="shrink-0 text-muted-foreground">
                  {isImage ? (
                    <ImageIcon className="size-5" />
                  ) : (
                    <FileText className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">
                    {a.file_name}
                  </p>
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
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
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
  );
}

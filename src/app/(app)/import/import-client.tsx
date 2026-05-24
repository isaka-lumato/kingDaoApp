"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  previewImportAction,
  commitImportAction,
  type PreviewState,
  type CommitState,
} from "@/server/import/import-actions";

export default function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [committed, setCommitted] = useState<CommitState | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setPreview(null);
    setCommitted(null);
  }

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setCommitted(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await previewImportAction(fd);
      setPreview(res);
    });
  }

  function onConfirm() {
    if (!preview || !preview.ok || !file) return;
    const fd = new FormData();
    fd.set("jobId", preview.jobId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await commitImportAction(fd);
      setCommitted(res);
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Import Excel Tracker
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Upload a <code>.xlsx</code> file. Preview row-by-row; confirm to commit.
        </p>
      </div>

      {/* Upload form */}
      {!preview && (
        <form
          onSubmit={onUpload}
          className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4"
        >
          <label className="block">
            <span className="block text-sm font-medium text-foreground mb-1.5">
              Excel file
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
            />
          </label>
          <button
            type="submit"
            disabled={!file || isPending}
            className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Parsing…" : "Preview"}
          </button>
        </form>
      )}

      {/* Preview result */}
      {preview && !preview.ok && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{preview.error}</span>
          <button onClick={reset} className="ml-4 hover:opacity-70">
            Try again
          </button>
        </div>
      )}

      {preview?.ok && !committed && (
        <PreviewPanel
          preview={preview}
          onConfirm={onConfirm}
          onCancel={reset}
          isPending={isPending}
        />
      )}

      {/* Commit outcome */}
      {committed && (
        <CommitOutcome state={committed} onReset={reset} />
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  onConfirm,
  onCancel,
  isPending,
}: {
  preview: Extract<PreviewState, { ok: true }>;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { result, autoCreate, filename } = preview;
  const summary = result.summary;
  const canConfirm = summary.parsed > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{filename}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {summary.parsed} parsed · {summary.errors} errors · {summary.warnings} warnings · skipped {summary.skipped} · years {summary.years.join(", ") || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Committing…" : `Confirm import (${summary.parsed} rows)`}
          </button>
        </div>
      </div>

      {/* Auto-create previews */}
      {(autoCreate.clients.length > 0 || autoCreate.icds.length > 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-4 text-sm">
          <p className="font-medium text-foreground mb-2">
            New reference records will be created
          </p>
          {autoCreate.clients.length > 0 && (
            <p className="text-muted-foreground">
              <span className="text-foreground font-medium">Clients ({autoCreate.clients.length}):</span>{" "}
              {autoCreate.clients.join(", ")}
            </p>
          )}
          {autoCreate.icds.length > 0 && (
            <p className="text-muted-foreground mt-1">
              <span className="text-foreground font-medium">ICDs ({autoCreate.icds.length}):</span>{" "}
              {autoCreate.icds.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <details open className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-4">
          <summary className="text-sm font-medium text-foreground cursor-pointer">
            Errors ({result.errors.length}) — these rows will NOT be imported
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground max-h-60 overflow-y-auto">
            {result.errors.map((e, i) => (
              <li key={i}>
                <span className="text-destructive font-mono">
                  row {e.rowIndex + 1}
                  {e.ref_no ? ` · ${e.ref_no}` : ""}
                  {e.field ? ` · ${e.field}` : ""}:
                </span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <details className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-4">
          <summary className="text-sm font-medium text-foreground cursor-pointer">
            Warnings ({result.warnings.length}) — rows still import; review afterward
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground max-h-60 overflow-y-auto">
            {result.warnings.map((w, i) => (
              <li key={i}>
                <span className="text-amber-500 font-mono">
                  row {w.rowIndex + 1}
                  {w.ref_no ? ` · ${w.ref_no}` : ""}
                  {w.field ? ` · ${w.field}` : ""}:
                </span>{" "}
                {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Sample of parsed rows */}
      {result.consignments.length > 0 && (
        <details open className="rounded-2xl border border-border bg-card px-6 py-4">
          <summary className="text-sm font-medium text-foreground cursor-pointer">
            Preview of parsed rows (showing first 25 of {result.consignments.length})
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Year</th>
                  <th className="py-2 pr-3">REF</th>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">B/L</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Cnt</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">ICD</th>
                  <th className="py-2 pr-3">EFD</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {result.consignments.slice(0, 25).map((c) => (
                  <tr key={c.rowIndex} className="border-t border-border">
                    <td className="py-1.5 pr-3 font-mono text-muted-foreground">{c.rowIndex + 1}</td>
                    <td className="py-1.5 pr-3">{c.year}</td>
                    <td className="py-1.5 pr-3 font-mono">{c.ref_no}</td>
                    <td className="py-1.5 pr-3">{c.client_name ?? "—"}</td>
                    <td className="py-1.5 pr-3">{c.bl_number ?? "—"}</td>
                    <td className="py-1.5 pr-3">{c.container_type ?? "—"}</td>
                    <td className="py-1.5 pr-3">{c.container_count ?? "—"}</td>
                    <td className="py-1.5 pr-3">{c.amount?.toLocaleString() ?? "—"}</td>
                    <td className="py-1.5 pr-3">{c.icd_name ?? "—"}</td>
                    <td className="py-1.5 pr-3">{c.efd_codes.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function CommitOutcome({
  state,
  onReset,
}: {
  state: CommitState;
  onReset: () => void;
}) {
  if (!state.ok) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-4">
        <p className="text-sm text-destructive font-medium">Import failed</p>
        <p className="text-xs text-muted-foreground mt-1">{state.error}</p>
        <button
          onClick={onReset}
          className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          Start over
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-4">
      <p className="text-sm font-medium text-foreground">
        Import complete — {state.inserted} consignment{state.inserted === 1 ? "" : "s"} inserted
      </p>
      {state.failed > 0 && (
        <details open className="mt-3">
          <summary className="text-xs font-medium text-amber-500 cursor-pointer">
            {state.failed} row{state.failed === 1 ? "" : "s"} failed during insert
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground max-h-60 overflow-y-auto">
            {state.details.map((d, i) => (
              <li key={i}>
                <span className="text-destructive font-mono">
                  row {d.rowIndex + 1}
                  {d.ref_no ? ` · ${d.ref_no}` : ""}:
                </span>{" "}
                {d.error}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-4 flex gap-2">
        <Link
          href="/consignments"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Go to consignments
        </Link>
        <button
          onClick={onReset}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Import another
        </button>
      </div>
    </div>
  );
}

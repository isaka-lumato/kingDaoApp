"use client";

import { useState, useTransition, useActionState } from "react";
import Link from "next/link";
import { PIPELINE_STAGES, isStageComplete, resolveActiveStage, type StageField } from "@/lib/pipeline";
import { formatTzs } from "@/lib/money";
import { usePermissions } from "@/hooks/use-permissions";
import BatchLink from "@/components/batch-link";
import StageActionShell from "@/components/stage-action-shell";
import AttachmentsTab from "./_attachments/attachments-tab";
import type { AttachmentRow } from "@/server/actions/attachment-actions";
import {
  duplicateConsignmentAction,
  softDeleteConsignmentAction,
} from "@/server/actions/consignment-actions";

type Client = { id: string; name: string };
type ICD = { id: string; name: string; location: string | null };

type Consignment = {
  id: string;
  ref_no: string;
  year: number;
  serial_no: number | null;
  tansad_no: string | null;
  bl_number: string | null;
  in_ref: string | null;
  client_id: string | null;
  container_count: number | null;
  container_type: string | null;
  goods_description: string | null;
  vessel_name: string | null;
  arrival_date: string | null;
  amount: number | null;
  remarks: string | null;
  is_failed: boolean | null;
  is_shared: boolean | null;
  manifest_status: string;
  shipping_batch_status: string;
  tanesws_status: string;
  assessment_status: string;
  tbs_loading_status: string;
  tbs_debit_status: string;
  manifest_comp_status: string;
  duty_status: string;
  inspection_file_status: string;
  release_status: string;
  release_date: string | null;
  created_at: string;
  updated_at: string;
  clients: Client | Client[] | null;
  icds: ICD | ICD[] | null;
};

type AuditEntry = {
  id: string;
  occurred_at: string;
  actor_email: string | null;
  column_name: string | null;
  // audit_log.old_value / new_value are jsonb — can be a string, number,
  // boolean, null, or the full row object (for _inserted / _deleted
  // sentinels). React cannot render objects directly, so renderAuditValue()
  // below collapses them to a printable string.
  old_value: unknown;
  new_value: unknown;
};

/**
 * Stringify a jsonb audit value for display. Truncates long object dumps
 * (the _inserted / _deleted sentinel rows write the entire consignment row
 * into new_value / old_value respectively).
 */
function renderAuditValue(v: unknown, maxLen = 60): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > maxLen ? v.slice(0, maxLen) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return "[unrenderable]";
  }
}

/**
 * Human-readable label for the column_name field. The audit trigger uses
 * `_inserted` and `_deleted` sentinels for row-level events; everything else
 * is a real column name.
 */
function renderColumnLabel(col: string | null): string {
  if (!col) return "—";
  if (col === "_inserted") return "Row created";
  if (col === "_deleted") return "Row deleted";
  if (col === "FORCED_STAGE_CHANGE") return "Forced stage change";
  return col;
}

type LinkedEfd = {
  id: string;
  efd_code: string;
  efd_time: string | null;
  is_private: boolean;
  is_transit: boolean;
  is_shared: boolean;
  created_at: string;
};

type GutaPair = {
  batchCode: string;
  thisRole: "PARTS" | "FRAMES";
  sibling: {
    id: string;
    ref_no: string;
    bl_number: string | null;
    container_count: number | null;
    container_type: string | null;
    amount: number | null;
    release_status: string;
    release_date: string | null;
    goods_description: string | null;
  };
};

type Props = {
  consignment: Consignment;
  auditLog: AuditEntry[];
  linkedEfds: LinkedEfd[];
  gutaPair: GutaPair | null;
  attachments: AttachmentRow[];
};

const STATUS_STYLES: Record<string, string> = {
  Done: "bg-stage-done/15 text-stage-done border border-stage-done/40",
  Action: "bg-stage-action/15 text-stage-action border border-stage-action/40",
  Waiting: "bg-muted/60 text-muted-foreground border border-border",
};

function StageBadge({ field, status }: { field: StageField; status: string }) {
  const done = isStageComplete(field, status);
  const isAction = status === "Action";
  const cls = done
    ? "bg-stage-done/15 text-stage-done border border-stage-done/40"
    : isAction
    ? "bg-stage-action/15 text-stage-action border border-stage-action/40"
    : "bg-muted/60 text-muted-foreground border border-border";
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground font-medium">{value ?? <span className="text-muted-foreground/50 font-normal">—</span>}</p>
    </div>
  );
}

// `linkedEfds` (still on Props, still passed by the page) is intentionally not
// destructured while the EFD UI is temporarily hidden — see the commented
// "Linked EFDs" section below. Restore the destructure when re-enabling EFD.
export default function ConsignmentDetail({ consignment, auditLog, gutaPair, attachments }: Props) {
  const [tab, setTab] = useState<"overview" | "pipeline" | "files" | "audit">("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteState, deleteAction] = useActionState<
    { error?: string; success?: boolean } | null,
    FormData
  >(
    async (_prev, fd) => softDeleteConsignmentAction(_prev, fd),
    null
  );
  const [isDuplicating, startDuplicate] = useTransition();
  const { isAdmin } = usePermissions();

  function handleDuplicate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startDuplicate(() => {
      void duplicateConsignmentAction(fd);
    });
  }

  // Normalize relation joins (Supabase may return array or object).
  const client = Array.isArray(consignment.clients)
    ? consignment.clients[0]
    : consignment.clients;
  const icd = Array.isArray(consignment.icds)
    ? consignment.icds[0]
    : consignment.icds;

  const stageValues: Record<string, string> = {
    manifest_status: consignment.manifest_status,
    shipping_batch_status: consignment.shipping_batch_status,
    tanesws_status: consignment.tanesws_status,
    assessment_status: consignment.assessment_status,
    tbs_loading_status: consignment.tbs_loading_status,
    tbs_debit_status: consignment.tbs_debit_status,
    manifest_comp_status: consignment.manifest_comp_status,
    duty_status: consignment.duty_status,
    inspection_file_status: consignment.inspection_file_status,
    release_status: consignment.release_status,
  };

  const isReleased = consignment.release_status === "Released";
  const doneCount = PIPELINE_STAGES.filter(
    (s) => isStageComplete(s.field, stageValues[s.field] ?? "")
  ).length;
  const progress = Math.round((doneCount / PIPELINE_STAGES.length) * 100);

  const activeStage = resolveActiveStage(stageValues) as StageField;
  const stageMenuTarget = {
    id: consignment.id,
    ref_no: consignment.ref_no,
    client_name: client?.name ?? "—",
    active_stage: activeStage,
    manifest_status: consignment.manifest_status,
    shipping_batch_status: consignment.shipping_batch_status,
    tanesws_status: consignment.tanesws_status,
    assessment_status: consignment.assessment_status,
    tbs_loading_status: consignment.tbs_loading_status,
    tbs_debit_status: consignment.tbs_debit_status,
    manifest_comp_status: consignment.manifest_comp_status,
    duty_status: consignment.duty_status,
    inspection_file_status: consignment.inspection_file_status,
    release_status: consignment.release_status,
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/consignments"
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ← Consignments
          </Link>
          <span className="text-border">/</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">
              {consignment.ref_no}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {client?.id ? (
                <Link
                  href={`/clients?c=${client.id}`}
                  className="hover:text-foreground hover:underline transition-colors"
                >
                  {client.name}
                </Link>
              ) : (
                (client?.name ?? "—")
              )}{" "}
              · {consignment.year}
              {isReleased && (
                <span className="ml-2 text-stage-done font-medium">✓ Released</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <form onSubmit={handleDuplicate} className="flex-1 sm:flex-none">
            <input type="hidden" name="id" value={consignment.id} />
            <button
              type="submit"
              disabled={isDuplicating}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              title="Duplicate this consignment"
            >
              {isDuplicating ? "Copying…" : "Duplicate"}
            </button>
          </form>
          <Link
            href={`/consignments/${consignment.id}/edit`}
            className="flex-1 sm:flex-none text-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Edit
          </Link>
          {isAdmin && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex-1 sm:flex-none rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Pipeline progress</span>
          <span>{doneCount}/{PIPELINE_STAGES.length} stages complete</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-stage-done rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        {(["overview", "pipeline", "files", "audit"] as const).map((t) => {
          const badgeCount =
            t === "audit" ? auditLog.length : t === "files" ? attachments.length : 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px text-center",
                tab === t
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t}
              {badgeCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Core details */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              Core details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Client" value={client?.name} />
              <Field label="Year" value={consignment.year} />
              <Field label="Serial No" value={consignment.serial_no} />
              <Field label="B/L Number" value={consignment.bl_number} />
              <Field label="TANSAD No" value={consignment.tansad_no} />
              <Field
                label="In Ref"
                value={
                  consignment.in_ref && consignment.client_id ? (
                    <BatchLink
                      inRef={consignment.in_ref}
                      clientId={consignment.client_id}
                      year={consignment.year}
                    />
                  ) : null
                }
              />
              <Field label="ICD" value={icd ? `${icd.name}${icd.location ? ` (${icd.location})` : ""}` : null} />
              <Field
                label="Goods"
                value={
                  consignment.goods_description ? (
                    <span className="break-words">{consignment.goods_description}</span>
                  ) : null
                }
              />
              <Field
                label="Amount"
                value={consignment.amount != null ? formatTzs(consignment.amount) : null}
              />
            </div>
          </section>

          {/* Vessel & shipping */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              Vessel &amp; shipping
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Vessel" value={consignment.vessel_name} />
              <Field
                label="Arrival date"
                value={
                  consignment.arrival_date
                    ? new Date(consignment.arrival_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : null
                }
              />
              <Field
                label="Container"
                value={
                  consignment.container_count
                    ? `${consignment.container_count} × ${consignment.container_type ?? "?"}`
                    : null
                }
              />
              <Field
                label="Release date"
                value={
                  consignment.release_date
                    ? new Date(consignment.release_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : null
                }
              />
            </div>
          </section>

          {/* GUTA pair (PRD §8.15) */}
          {gutaPair && (() => {
            const siblingReleased = gutaPair.sibling.release_status === "Released";
            const oneReleased = isReleased !== siblingReleased;
            const siblingRole = gutaPair.thisRole === "PARTS" ? "FRAMES" : "PARTS";
            return (
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    GUTA pair
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-600 border-indigo-500/30 font-mono">
                    {gutaPair.batchCode} · this is {gutaPair.thisRole}
                  </span>
                </div>

                {oneReleased && (
                  <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                    <span aria-hidden className="text-base leading-none">⚠</span>
                    <span>
                      <strong className="font-semibold">Paired consignment not yet released.</strong>{" "}
                      {isReleased
                        ? `This ${gutaPair.thisRole} record is released but ${siblingRole} (${gutaPair.sibling.ref_no}) is still ${gutaPair.sibling.release_status}.`
                        : `${siblingRole} (${gutaPair.sibling.ref_no}) is already released but this ${gutaPair.thisRole} record is still ${consignment.release_status}.`}
                    </span>
                  </div>
                )}

                <Link
                  href={`/consignments/${gutaPair.sibling.id}`}
                  className="block rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                        Paired with ({siblingRole})
                      </p>
                      <p className="font-mono font-bold text-foreground">
                        {gutaPair.sibling.ref_no}
                      </p>
                      {gutaPair.sibling.goods_description && (
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {gutaPair.sibling.goods_description}
                        </p>
                      )}
                    </div>
                    <span
                      className={[
                        "text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
                        siblingReleased
                          ? STATUS_STYLES.Done
                          : gutaPair.sibling.release_status === "Action"
                          ? STATUS_STYLES.Action
                          : STATUS_STYLES.Waiting,
                      ].join(" ")}
                    >
                      {gutaPair.sibling.release_status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                    <Field label="B/L" value={gutaPair.sibling.bl_number} />
                    <Field
                      label="Container"
                      value={
                        gutaPair.sibling.container_count
                          ? `${gutaPair.sibling.container_count} × ${gutaPair.sibling.container_type ?? "?"}`
                          : null
                      }
                    />
                    <Field
                      label="Amount"
                      value={
                        gutaPair.sibling.amount != null
                          ? formatTzs(gutaPair.sibling.amount)
                          : null
                      }
                    />
                    <Field
                      label="Release date"
                      value={
                        gutaPair.sibling.release_date
                          ? new Date(gutaPair.sibling.release_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : null
                      }
                    />
                  </div>
                </Link>
              </section>
            );
          })()}

          {/* Linked EFDs — EFD UI temporarily hidden, do not delete.
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Linked EFD records
              </h2>
              <Link
                href={`/efd/new`}
                className="text-xs text-brand hover:underline"
              >
                + New EFD
              </Link>
            </div>
            {linkedEfds.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No EFD records linked yet.
              </p>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border">
                {linkedEfds.map((e) => (
                  <Link
                    key={e.id}
                    href={`/efd/${e.id}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-mono font-bold text-xs text-brand">
                      {e.efd_code}
                    </span>
                    {e.efd_time && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {e.efd_time}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1 flex-1">
                      {e.is_private && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-violet-500/15 text-violet-600 border-violet-500/30">
                          PRIVATE
                        </span>
                      )}
                      {e.is_transit && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-600 border-sky-500/30">
                          TRANSIT
                        </span>
                      )}
                      {e.is_shared && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-600 border-amber-500/30">
                          SHARED
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
          */}

          {/* Remarks */}
          {consignment.remarks && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Remarks
              </h2>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {consignment.remarks}
              </p>
            </section>
          )}

          {/* Timestamps */}
          <div className="flex gap-6 text-xs text-muted-foreground">
            <span>
              Created{" "}
              {new Date(consignment.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span>
              Updated{" "}
              {new Date(consignment.updated_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}

      {/* ── Pipeline tab ── */}
      {tab === "pipeline" && (
        <div className="space-y-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const status = stageValues[stage.field] ?? "Waiting";
            const isDone = isStageComplete(stage.field, status);
            const isActive = !isDone && PIPELINE_STAGES
              .slice(0, idx)
              .every((s) => isStageComplete(s.field, stageValues[s.field] ?? ""));

            const rowClass = [
              "flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors",
              isDone
                ? "border-stage-done/30 bg-stage-done/5"
                : isActive
                ? "border-brand/40 bg-brand/5"
                : "border-border bg-card",
            ].join(" ");

            const rowContent = (
              <>
                <div
                  className={[
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    isDone
                      ? "bg-stage-done text-white"
                      : isActive
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {isDone ? "✓" : idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      isDone
                        ? "text-stage-done"
                        : isActive
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </p>
                </div>

                <StageBadge field={stage.field} status={status} />
              </>
            );

            if (isDone) {
              return (
                <div key={stage.field} className={rowClass}>
                  {rowContent}
                </div>
              );
            }

            return (
              <StageActionShell
                key={stage.field}
                consignment={stageMenuTarget}
                targetStage={stage.field}
                triggerClassName={`${rowClass} w-full text-left cursor-pointer hover:bg-muted/30`}
                trigger={rowContent}
              />
            );
          })}
        </div>
      )}

      {/* ── Files tab ── */}
      {tab === "files" && (
        <AttachmentsTab consignmentId={consignment.id} initial={attachments} />
      )}

      {/* ── Audit tab ── */}
      {tab === "audit" && (
        <>
          {auditLog.length === 0 ? (
            <div className="rounded-xl border border-border overflow-hidden px-4 py-10 text-center text-muted-foreground text-sm">
              No audit history yet.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">When</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">By</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Field</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Old</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">New</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditLog.map((entry) => {
                      // Sentinel rows (_inserted / _deleted) hold the entire row
                      // object in new/old — not useful in the tiny Old/New
                      // columns. Show "—" for those and let the Field column
                      // carry the meaning.
                      const isSentinel =
                        entry.column_name === "_inserted" ||
                        entry.column_name === "_deleted" ||
                        entry.column_name === "FORCED_STAGE_CHANGE";
                      return (
                        <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(entry.occurred_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate">
                            {entry.actor_email ?? "system"}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-foreground">
                            {renderColumnLabel(entry.column_name)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground break-all">
                            {isSentinel ? "—" : renderAuditValue(entry.old_value)}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium text-foreground break-all">
                            {isSentinel ? "—" : renderAuditValue(entry.new_value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <ul className="md:hidden flex flex-col gap-2">
                {auditLog.map((entry) => {
                  const isSentinel =
                    entry.column_name === "_inserted" ||
                    entry.column_name === "_deleted" ||
                    entry.column_name === "FORCED_STAGE_CHANGE";
                  return (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-border bg-card p-3"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>
                          {new Date(entry.occurred_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="truncate max-w-[60%]">
                          {entry.actor_email ?? "system"}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-foreground mt-1">
                        {renderColumnLabel(entry.column_name)}
                      </p>
                      {!isSentinel && (
                        <p className="text-[11px] mt-1 break-all">
                          <span className="text-muted-foreground">
                            {renderAuditValue(entry.old_value)}
                          </span>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span className="font-medium text-foreground">
                            {renderAuditValue(entry.new_value)}
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-1">Delete consignment</h3>
            <p className="text-muted-foreground text-sm mb-4">
              This will soft-delete <strong className="text-foreground">{consignment.ref_no}</strong>.
              The record is hidden but not erased. This action is logged.
            </p>

            {deleteState && "error" in deleteState && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {deleteState.error}
              </div>
            )}

            <form action={deleteAction} className="space-y-4">
              <input type="hidden" name="id" value={consignment.id} />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  name="reason"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, wrong year assigned"
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setDeleteOpen(false); setDeleteReason(""); }}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!deleteReason.trim()}
                  className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Confirm delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

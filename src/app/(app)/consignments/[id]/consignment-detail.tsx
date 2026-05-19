"use client";

import { useState } from "react";
import Link from "next/link";
import { PIPELINE_STAGES } from "@/lib/pipeline";
import { formatTzs } from "@/lib/money";

type Client = { id: string; name: string };
type ICD = { id: string; name: string; code: string };

type Consignment = {
  id: string;
  ref_no: string;
  year: number;
  serial_no: number | null;
  tansad_no: string | null;
  bl_number: string | null;
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
  changed_at: string;
  changed_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
};

type Props = {
  consignment: Consignment;
  auditLog: AuditEntry[];
};

const STATUS_STYLES: Record<string, string> = {
  Done: "bg-stage-done/15 text-stage-done border border-stage-done/40",
  Action: "bg-stage-action/15 text-stage-action border border-stage-action/40",
  Waiting: "bg-muted/60 text-muted-foreground border border-border",
};

function StageBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES.Waiting}`}
    >
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

export default function ConsignmentDetail({ consignment, auditLog }: Props) {
  const [tab, setTab] = useState<"overview" | "pipeline" | "audit">("overview");

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

  const isReleased = consignment.release_status === "Done";
  const doneCount = PIPELINE_STAGES.filter(
    (s) => stageValues[s.field] === "Done"
  ).length;
  const progress = Math.round((doneCount / PIPELINE_STAGES.length) * 100);

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
              {client?.name ?? "—"} · {consignment.year}
              {isReleased && (
                <span className="ml-2 text-stage-done font-medium">✓ Released</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/consignments/${consignment.id}/edit`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Edit
          </Link>
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
        {(["overview", "pipeline", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t}
            {t === "audit" && auditLog.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                {auditLog.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Core details */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              Core details
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Client" value={client?.name} />
              <Field label="Year" value={consignment.year} />
              <Field label="Serial No" value={consignment.serial_no} />
              <Field label="B/L Number" value={consignment.bl_number} />
              <Field label="TANSAD No" value={consignment.tansad_no} />
              <Field label="ICD" value={icd ? `${icd.name} (${icd.code})` : null} />
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
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
            const isDone = status === "Done";
            const isActive = !isDone && PIPELINE_STAGES
              .slice(0, idx)
              .every((s) => stageValues[s.field] === "Done");

            return (
              <div
                key={stage.field}
                className={[
                  "flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors",
                  isDone
                    ? "border-stage-done/30 bg-stage-done/5"
                    : isActive
                    ? "border-brand/40 bg-brand/5"
                    : "border-border bg-card",
                ].join(" ")}
              >
                {/* Step indicator */}
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

                <StageBadge status={status} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Audit tab ── */}
      {tab === "audit" && (
        <div className="rounded-xl border border-border overflow-hidden">
          {auditLog.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm">
              No audit history yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">When</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Field</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Old</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">New</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.changed_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-foreground">
                      {entry.field_name}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {entry.old_value ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">
                      {entry.new_value ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                      {entry.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

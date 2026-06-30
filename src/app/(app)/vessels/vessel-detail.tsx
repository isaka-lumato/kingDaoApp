"use client";

import Link from "next/link";
import { PIPELINE_STAGES, type StageField } from "@/lib/pipeline";

export type VesselConsignmentRow = {
  id: string;
  ref_no: string;
  year: number;
  serial_no: number | null;
  arrival_date: string | null;
  cargo_count: number | null;
  release_status: string;
  release_date: string | null;
  /** Resolved server-side from the joined client row. */
  client_label?: string;
  /** Filled in server-side for active rows only. */
  active_stage?: StageField;
};

export type SelectedVessel = {
  id: string;
  name: string;
  isActive: boolean;
  totalContainers: number;
  totalCount: number;
  activeCount: number;
  completedCount: number;
  active: VesselConsignmentRow[];
  completed: VesselConsignmentRow[];
};

const STAGE_LABEL: Record<StageField, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.field, s.label]),
) as Record<StageField, string>;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function refLabel(row: VesselConsignmentRow): string {
  if (row.ref_no) return row.ref_no;
  if (row.serial_no != null) return `KDL/${row.year}/${row.serial_no}`;
  return "—";
}

export default function VesselDetail({ vessel }: { vessel: SelectedVessel }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-foreground">{vessel.name}</h3>
          {!vessel.isActive && (
            <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
              inactive
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Consignments" value={String(vessel.totalCount)} />
        <StatCard label="Containers" value={String(vessel.totalContainers)} />
        <StatCard label="Active" value={String(vessel.activeCount)} />
        <StatCard label="Released" value={String(vessel.completedCount)} />
      </div>

      <JobTable
        title="Active jobs"
        rows={vessel.active}
        emptyLabel="No active jobs on this vessel."
        kind="active"
      />
      <JobTable
        title="Completed jobs"
        rows={vessel.completed}
        emptyLabel="No completed jobs on this vessel."
        kind="completed"
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function JobTable({
  title,
  rows,
  emptyLabel,
  kind,
}: {
  title: string;
  rows: VesselConsignmentRow[];
  emptyLabel: string;
  kind: "active" | "completed";
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="font-semibold text-foreground text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">Ref No</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">Client</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">Arrival</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  {kind === "active" ? "Current stage" : "Released"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Link
                      href={`/consignments/${row.id}`}
                      className="font-mono text-xs font-bold text-brand hover:underline"
                    >
                      {refLabel(row)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">
                    {row.client_label ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(row.arrival_date)}
                  </td>
                  <td className="px-4 py-2.5 text-foreground/80 text-xs whitespace-nowrap">
                    {kind === "active"
                      ? row.active_stage
                        ? STAGE_LABEL[row.active_stage]
                        : "—"
                      : formatDate(row.release_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

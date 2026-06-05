"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTzs } from "@/lib/money";
import { PIPELINE_STAGES, type StageField } from "@/lib/pipeline";

export type ClientConsignmentRow = {
  id: string;
  ref_no: string;
  year: number;
  serial_no: number | null;
  vessel_name: string | null;
  arrival_date: string | null;
  container_count: number | null;
  amount: number | null;
  release_status: string;
  release_date: string | null;
  /** Filled in server-side for active rows only. */
  active_stage?: StageField;
};

export type SelectedClient = {
  id: string;
  name: string;
  subLabel: string | null;
  contactEmail: string | null;
  notes: string | null;
  year: number;
  isAdmin: boolean;
  totalContainers: number;
  activeCount: number;
  completedCount: number;
  avgClearanceDays: number | null;
  /** Null for non-admins (never shipped to the client). */
  totalRevenue: number | null;
  active: ClientConsignmentRow[];
  completed: ClientConsignmentRow[];
};

const STAGE_LABEL: Record<StageField, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.field, s.label]),
) as Record<StageField, string>;

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function refLabel(row: ClientConsignmentRow): string {
  if (row.ref_no) return row.ref_no;
  if (row.serial_no != null) return `KDL/${row.year}/${row.serial_no}`;
  return "—";
}

export default function ClientDetail({ client }: { client: SelectedClient }) {
  const router = useRouter();

  function changeYear(year: number) {
    router.push(`/clients?c=${client.id}&year=${year}`, { scroll: false });
  }

  const title = client.subLabel ? `${client.name} — ${client.subLabel}` : client.name;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xl font-bold text-foreground">{title}</h3>
          {client.contactEmail && (
            <p className="text-sm text-muted-foreground mt-0.5">{client.contactEmail}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Year
          <select
            value={client.year}
            onChange={(e) => changeYear(Number(e.target.value))}
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Containers" value={String(client.totalContainers)} />
        <StatCard
          label="Avg clearance"
          value={client.avgClearanceDays != null ? `${client.avgClearanceDays} d` : "—"}
        />
        <StatCard
          label="Jobs"
          value={`${client.activeCount} active · ${client.completedCount} done`}
        />
        {client.isAdmin && client.totalRevenue != null && (
          <StatCard label="Revenue" value={formatTzs(client.totalRevenue)} />
        )}
      </div>

      <JobTable
        title="Active jobs"
        rows={client.active}
        emptyLabel="No active jobs this year."
        kind="active"
      />
      <JobTable
        title="Completed jobs"
        rows={client.completed}
        emptyLabel="No completed jobs this year."
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
  rows: ClientConsignmentRow[];
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
                <th className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">Vessel</th>
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
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[140px] truncate">
                    {row.vessel_name ?? "—"}
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

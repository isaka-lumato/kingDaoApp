/**
 * Pure types + constants shared by the reports page, the XLSX builder, and
 * the data-fetch layer. Lives outside `fetch-report-rows.ts` (which is
 * `server-only`) so the XLSX builder can be unit-tested in Vitest without
 * pulling in the server-only barrier.
 */

/**
 * The 10 pipeline-Action stages surfaced by `v_pipeline_funnel`. Used by the
 * funnel-report page render and by the XLSX builder.
 */
export const FUNNEL_STAGES = [
  { key: "manifest_action", label: "Manifest" },
  { key: "shipping_action", label: "Shipping" },
  { key: "tanesws_action", label: "TANESWS" },
  { key: "assessment_action", label: "Assessment" },
  { key: "tbs_loading_action", label: "TBS Load" },
  { key: "tbs_debit_action", label: "TBS Debit" },
  { key: "manifest_comp_action", label: "Mfst Comp" },
  { key: "duty_action", label: "Duty" },
  { key: "inspection_action", label: "Inspection" },
  { key: "ready_to_release", label: "Ready to release" },
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number]["key"];

export type ReportFilters = {
  year: number;
  from: string | null;
  to: string | null;
};

// ─── Row shapes (one per report) ───────────────────────────────────────────

export type RevenueRow = {
  year: number | null;
  month: string | null;
  month_label: string | null;
  consignment_count: number | null;
  total_amount: number | null;
};

export type ClientVolumeRow = {
  client_id: string | null;
  client_name: string | null;
  sub_label: string | null;
  job_count: number | null;
  total_containers: number | null;
  total_revenue: number | null;
  released_count: number | null;
  active_count: number | null;
};

export type TurnaroundClientRow = {
  client_id: string | null;
  client_name: string | null;
  sub_label: string | null;
  released_count: number | null;
  avg_days: number | null;
  min_days: number | null;
  max_days: number | null;
};

export type TurnaroundIcdRow = {
  icd_id: string | null;
  icd_name: string | null;
  released_count: number | null;
  avg_days: number | null;
};

export type PipelineFunnelData = {
  year: number | null;
  total_active: number | null;
  released: number | null;
} & {
  [K in FunnelStageKey]: number | null;
};

export type PendingRefundRow = {
  id: string | null;
  ref_no: string | null;
  year: number | null;
  client_name: string | null;
  amount: number | null;
  remarks: string | null;
  release_date: string | null;
  created_at: string | null;
};

// ─── Discriminated payload returned by fetchReportRows ────────────────────

export type ReportPayload =
  | { kind: "revenue"; rows: RevenueRow[]; error: string | null }
  | { kind: "client_volume"; rows: ClientVolumeRow[]; error: string | null }
  | {
      kind: "turnaround_client";
      rows: TurnaroundClientRow[];
      error: string | null;
    }
  | { kind: "turnaround_icd"; rows: TurnaroundIcdRow[]; error: string | null }
  | {
      kind: "pipeline_funnel";
      funnel: PipelineFunnelData | null;
      error: string | null;
    }
  | {
      kind: "pending_refunds";
      rows: PendingRefundRow[];
      error: string | null;
    };

// ─── Pure helpers ──────────────────────────────────────────────────────────

import type { ReportKind } from "@/app/(app)/reports/report-options";

/**
 * Human-readable title for the report — used by the page header and by the
 * XLSX sheet name + filename. Keep changes here in sync with both consumers.
 */
export function reportTitle(kind: ReportKind, { year }: ReportFilters): string {
  switch (kind) {
    case "revenue":
      return `Revenue Summary · ${year}`;
    case "client_volume":
      return `Client Volume · ${year}`;
    case "turnaround_client":
      return `Turnaround Time · by Client · ${year}`;
    case "turnaround_icd":
      return `Turnaround Time · by ICD · ${year}`;
    case "pipeline_funnel":
      return `Pipeline Bottleneck · ${year}`;
    case "pending_refunds":
      return `Pending Refunds · ${year}`;
  }
}

/**
 * ASCII-safe filename stem used by the route handler. `kdl-<kind>-<year>` or
 * `kdl-<kind>-<year>-<from>-<to>` when a range is applied.
 */
export function reportFilenameStem(
  kind: ReportKind,
  { year, from, to }: ReportFilters,
): string {
  const range = from || to ? `-${from ?? "start"}-${to ?? "end"}` : "";
  return `kdl-${kind.replace(/_/g, "-")}-${year}${range}`;
}

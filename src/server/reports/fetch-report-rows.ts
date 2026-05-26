import "server-only";

import type { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ReportKind } from "@/app/(app)/reports/report-options";
import type {
  PipelineFunnelData,
  ReportFilters,
  ReportPayload,
} from "./report-types";

/**
 * Shared data layer for `/reports` (T-070) + `/api/reports/<kind>/xlsx`
 * (T-071) + the future PDF route (T-072).
 *
 * Each function returns the same `{ rows, error }` (or `{ funnel, error }`)
 * payload shape the page used to build inline. The page + the export route
 * call this so the two stay byte-equivalent — that's the seam status.md
 * names in the Next-5 list.
 *
 * D-026: all reads via the user-bound server client (caller passes it in).
 * No admin-client uses here — admin allowlist stays at 3 sites.
 *
 * Pure types + constants live in `./report-types.ts` so the XLSX builder
 * can be unit-tested without crossing the `server-only` barrier.
 */

// Re-export pure types/constants/helpers so existing imports of
// `@/server/reports/fetch-report-rows` keep working.
export {
  FUNNEL_STAGES,
  reportTitle,
  reportFilenameStem,
} from "./report-types";
export type {
  ReportFilters,
  ReportPayload,
  RevenueRow,
  ClientVolumeRow,
  TurnaroundClientRow,
  TurnaroundIcdRow,
  PipelineFunnelData,
  PendingRefundRow,
  FunnelStageKey,
} from "./report-types";

type Sb = Awaited<ReturnType<typeof getSupabaseServerClient>>;

// ─── Per-report fetchers ───────────────────────────────────────────────────

async function fetchRevenue(
  supabase: Sb,
  { year, from, to }: ReportFilters,
): Promise<Extract<ReportPayload, { kind: "revenue" }>> {
  let q = supabase
    .from("v_revenue_monthly")
    .select("year, month, month_label, consignment_count, total_amount")
    .eq("year", year)
    .order("month", { ascending: true });
  if (from) q = q.gte("month", from);
  if (to) q = q.lte("month", to);
  const { data, error } = await q;
  return { kind: "revenue", rows: data ?? [], error: error?.message ?? null };
}

async function fetchClientVolume(
  supabase: Sb,
  { year }: ReportFilters,
): Promise<Extract<ReportPayload, { kind: "client_volume" }>> {
  const { data, error } = await supabase
    .from("v_client_volume")
    .select(
      "client_id, client_name, sub_label, job_count, total_containers, total_revenue, released_count, active_count",
    )
    .eq("year", year)
    .order("total_containers", { ascending: false });
  return {
    kind: "client_volume",
    rows: data ?? [],
    error: error?.message ?? null,
  };
}

async function fetchTurnaroundClient(
  supabase: Sb,
  { year }: ReportFilters,
): Promise<Extract<ReportPayload, { kind: "turnaround_client" }>> {
  const { data, error } = await supabase
    .from("v_turnaround_by_client")
    .select(
      "client_id, client_name, sub_label, released_count, avg_days, min_days, max_days",
    )
    .eq("year", year)
    .order("avg_days", { ascending: true });
  return {
    kind: "turnaround_client",
    rows: data ?? [],
    error: error?.message ?? null,
  };
}

async function fetchTurnaroundIcd(
  supabase: Sb,
  { year }: ReportFilters,
): Promise<Extract<ReportPayload, { kind: "turnaround_icd" }>> {
  const { data, error } = await supabase
    .from("v_turnaround_by_icd")
    .select("icd_id, icd_name, released_count, avg_days")
    .eq("year", year)
    .order("avg_days", { ascending: true });
  return {
    kind: "turnaround_icd",
    rows: data ?? [],
    error: error?.message ?? null,
  };
}

async function fetchPipelineFunnel(
  supabase: Sb,
  { year }: ReportFilters,
): Promise<Extract<ReportPayload, { kind: "pipeline_funnel" }>> {
  const { data, error } = await supabase
    .from("v_pipeline_funnel")
    .select("*")
    .eq("year", year)
    .maybeSingle();
  return {
    kind: "pipeline_funnel",
    funnel: (data as PipelineFunnelData | null) ?? null,
    error: error?.message ?? null,
  };
}

async function fetchPendingRefunds(
  supabase: Sb,
  { year, from, to }: ReportFilters,
): Promise<Extract<ReportPayload, { kind: "pending_refunds" }>> {
  let q = supabase
    .from("v_pending_refunds")
    .select(
      "id, ref_no, year, client_name, amount, remarks, release_date, created_at",
    )
    .eq("year", year)
    .order("release_date", { ascending: false, nullsFirst: false });
  if (from) q = q.gte("release_date", from);
  if (to) q = q.lte("release_date", to);
  const { data, error } = await q;
  return {
    kind: "pending_refunds",
    rows: data ?? [],
    error: error?.message ?? null,
  };
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Fetch the row-set for the given report kind. Returns a discriminated union
 * so the caller can `switch (payload.kind)` and access the typed rows/funnel.
 *
 * Honours the page's filter semantics (D-039): only Revenue + Pending Refunds
 * apply `from`/`to`; the other four reports ignore the date range.
 */
export async function fetchReportRows(
  kind: ReportKind,
  filters: ReportFilters,
  supabase: Sb,
): Promise<ReportPayload> {
  switch (kind) {
    case "revenue":
      return fetchRevenue(supabase, filters);
    case "client_volume":
      return fetchClientVolume(supabase, filters);
    case "turnaround_client":
      return fetchTurnaroundClient(supabase, filters);
    case "turnaround_icd":
      return fetchTurnaroundIcd(supabase, filters);
    case "pipeline_funnel":
      return fetchPipelineFunnel(supabase, filters);
    case "pending_refunds":
      return fetchPendingRefunds(supabase, filters);
  }
}

import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatTzs } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import {
  fetchReportRows,
  reportTitle,
  FUNNEL_STAGES,
  type ReportFilters,
  type ReportPayload,
} from "@/server/reports/fetch-report-rows";
import ReportsFilterBar, {
  REPORT_OPTIONS,
  type ReportKind,
} from "./reports-filter-bar";

export const metadata: Metadata = { title: "Reports — KDL Tracker" };

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_REPORT: ReportKind = "revenue";

function parseReportKind(raw: string | undefined): ReportKind {
  if (!raw) return DEFAULT_REPORT;
  const match = REPORT_OPTIONS.find((r) => r.value === raw);
  return match ? match.value : DEFAULT_REPORT;
}

function isValidISODate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function exportParams(filters: ReportFilters): string {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

function exportHref(kind: ReportKind, filters: ReportFilters): string {
  return `/api/reports/${kind}/xlsx?${exportParams(filters)}`;
}

function exportHrefPdf(kind: ReportKind, filters: ReportFilters): string {
  return `/api/reports/${kind}/pdf?${exportParams(filters)}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    report?: string;
    year?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const report = parseReportKind(params.report);
  const currentYear = new Date().getFullYear();
  const year = params.year
    ? Number.parseInt(params.year, 10) || currentYear
    : currentYear;

  // Year selector: this year ± 3 — covers historical bulk-loaded years.
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);

  const from = isValidISODate(params.from) ? params.from : null;
  const to = isValidISODate(params.to) ? params.to : null;

  // RLS posture per D-026: user-bound server client.
  const supabase = await getSupabaseServerClient();
  const filters: ReportFilters = { year, from, to };
  const payload = await fetchReportRows(report, filters, supabase);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Management reports backed by the same Postgres views the dashboard reads.
        </p>
      </div>

      <ReportsFilterBar
        report={report}
        year={year}
        yearOptions={yearOptions}
        from={from}
        to={to}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {payload.kind === "revenue" && (
          <RevenueReport payload={payload} filters={filters} />
        )}
        {payload.kind === "client_volume" && (
          <ClientVolumeReport payload={payload} filters={filters} />
        )}
        {payload.kind === "turnaround_client" && (
          <TurnaroundClientReport payload={payload} filters={filters} />
        )}
        {payload.kind === "turnaround_icd" && (
          <TurnaroundIcdReport payload={payload} filters={filters} />
        )}
        {payload.kind === "pipeline_funnel" && (
          <PipelineFunnelReport payload={payload} filters={filters} />
        )}
        {payload.kind === "pending_refunds" && (
          <PendingRefundsReport payload={payload} filters={filters} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────

function ReportHeader({
  title,
  subtitle,
  exportHref,
  exportHrefPdf,
}: {
  title: string;
  subtitle: string;
  exportHref: string;
  exportHrefPdf: string;
}) {
  const anchorCls =
    "shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors";
  return (
    <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <a href={exportHref} className={anchorCls} download>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export XLSX
        </a>
        <a href={exportHrefPdf} className={anchorCls} download>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
          Export PDF
        </a>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-sm text-muted-foreground"
      >
        {message}
      </td>
    </tr>
  );
}

function ErrorRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-sm text-destructive"
      >
        Failed to load: {message}
      </td>
    </tr>
  );
}

function TotalRow({
  cells,
}: {
  cells: ReadonlyArray<{ value: string | number; align?: "left" | "right"; mono?: boolean }>;
}) {
  return (
    <tr className="border-t-2 border-border bg-muted/30 font-semibold">
      {cells.map((c, i) => (
        <td
          key={i}
          className={`px-3 py-2 text-xs ${
            c.align === "right" ? "text-right" : "text-left"
          } ${c.mono ? "font-mono tabular-nums" : ""}`}
        >
          {c.value}
        </td>
      ))}
    </tr>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Revenue Summary — v_revenue_monthly
// ──────────────────────────────────────────────────────────────────────────

function RevenueReport({
  payload,
  filters,
}: {
  payload: Extract<ReportPayload, { kind: "revenue" }>;
  filters: ReportFilters;
}) {
  const { rows, error } = payload;
  const { from, to } = filters;
  const totalAmount = rows.reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0),
    0,
  );
  const totalCount = rows.reduce(
    (sum, r) => sum + Number(r.consignment_count ?? 0),
    0,
  );

  return (
    <>
      <ReportHeader
        title={reportTitle("revenue", filters)}
        subtitle={
          from || to
            ? `Filtered by month range${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`
            : "All months. Released consignments only."
        }
        exportHref={exportHref("revenue", filters)}
        exportHrefPdf={exportHrefPdf("revenue", filters)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
            <th className="px-3 py-2 text-left">Month</th>
            <th className="px-3 py-2 text-right">Released consignments</th>
            <th className="px-3 py-2 text-right">Total revenue</th>
          </tr>
        </thead>
        <tbody>
          {error && <ErrorRow colSpan={3} message={error} />}
          {!error && rows.length === 0 && (
            <EmptyRow colSpan={3} message="No released consignments in this range." />
          )}
          {!error &&
            rows.map((r) => (
              <tr
                key={r.month ?? ""}
                className="border-b border-border last:border-0 hover:bg-muted/10"
              >
                <td className="px-3 py-2 text-foreground">{r.month_label}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.consignment_count ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {formatTzs(r.total_amount)}
                </td>
              </tr>
            ))}
          {!error && rows.length > 0 && (
            <TotalRow
              cells={[
                { value: "Total" },
                { value: totalCount, align: "right", mono: true },
                { value: formatTzs(totalAmount), align: "right", mono: true },
              ]}
            />
          )}
        </tbody>
      </table>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Client Volume — v_client_volume
// ──────────────────────────────────────────────────────────────────────────

function ClientVolumeReport({
  payload,
  filters,
}: {
  payload: Extract<ReportPayload, { kind: "client_volume" }>;
  filters: ReportFilters;
}) {
  const { rows, error } = payload;
  const totalJobs = rows.reduce((s, r) => s + Number(r.job_count ?? 0), 0);
  const totalContainers = rows.reduce(
    (s, r) => s + Number(r.total_containers ?? 0),
    0,
  );
  const totalRevenue = rows.reduce(
    (s, r) => s + Number(r.total_revenue ?? 0),
    0,
  );

  return (
    <>
      <ReportHeader
        title={reportTitle("client_volume", filters)}
        subtitle="Ranked by container count. Released + active counts shown for context."
        exportHref={exportHref("client_volume", filters)}
        exportHrefPdf={exportHrefPdf("client_volume", filters)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-right">Jobs</th>
            <th className="px-3 py-2 text-right">Containers</th>
            <th className="px-3 py-2 text-right">Released</th>
            <th className="px-3 py-2 text-right">Active</th>
            <th className="px-3 py-2 text-right">Total revenue</th>
          </tr>
        </thead>
        <tbody>
          {error && <ErrorRow colSpan={6} message={error} />}
          {!error && rows.length === 0 && (
            <EmptyRow colSpan={6} message="No client volume data for this year." />
          )}
          {!error &&
            rows.map((r) => (
              <tr
                key={r.client_id ?? r.client_name ?? ""}
                className="border-b border-border last:border-0 hover:bg-muted/10"
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground truncate">
                    {r.client_name ?? "—"}
                  </div>
                  {r.sub_label && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.sub_label}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.job_count ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.total_containers ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-stage-done">
                  {r.released_count ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-stage-action">
                  {r.active_count ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {formatTzs(r.total_revenue)}
                </td>
              </tr>
            ))}
          {!error && rows.length > 0 && (
            <TotalRow
              cells={[
                { value: "Total" },
                { value: totalJobs, align: "right", mono: true },
                { value: totalContainers, align: "right", mono: true },
                { value: "", align: "right" },
                { value: "", align: "right" },
                { value: formatTzs(totalRevenue), align: "right", mono: true },
              ]}
            />
          )}
        </tbody>
      </table>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Turnaround by Client — v_turnaround_by_client
// ──────────────────────────────────────────────────────────────────────────

function TurnaroundClientReport({
  payload,
  filters,
}: {
  payload: Extract<ReportPayload, { kind: "turnaround_client" }>;
  filters: ReportFilters;
}) {
  const { rows, error } = payload;

  return (
    <>
      <ReportHeader
        title={reportTitle("turnaround_client", filters)}
        subtitle="Days from arrival_date to release_date for released consignments. Sorted fastest → slowest."
        exportHref={exportHref("turnaround_client", filters)}
        exportHrefPdf={exportHrefPdf("turnaround_client", filters)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-right">Released</th>
            <th className="px-3 py-2 text-right">Avg days</th>
            <th className="px-3 py-2 text-right">Min</th>
            <th className="px-3 py-2 text-right">Max</th>
          </tr>
        </thead>
        <tbody>
          {error && <ErrorRow colSpan={5} message={error} />}
          {!error && rows.length === 0 && (
            <EmptyRow colSpan={5} message="No released consignments yet." />
          )}
          {!error &&
            rows.map((r) => (
              <tr
                key={r.client_id ?? r.client_name ?? ""}
                className="border-b border-border last:border-0 hover:bg-muted/10"
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground truncate">
                    {r.client_name ?? "—"}
                  </div>
                  {r.sub_label && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.sub_label}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.released_count ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.avg_days ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                  {r.min_days ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                  {r.max_days ?? "—"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Turnaround by ICD — v_turnaround_by_icd
// ──────────────────────────────────────────────────────────────────────────

function TurnaroundIcdReport({
  payload,
  filters,
}: {
  payload: Extract<ReportPayload, { kind: "turnaround_icd" }>;
  filters: ReportFilters;
}) {
  const { rows, error } = payload;

  return (
    <>
      <ReportHeader
        title={reportTitle("turnaround_icd", filters)}
        subtitle="Days from arrival_date to release_date, aggregated by ICD."
        exportHref={exportHref("turnaround_icd", filters)}
        exportHrefPdf={exportHrefPdf("turnaround_icd", filters)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
            <th className="px-3 py-2 text-left">ICD</th>
            <th className="px-3 py-2 text-right">Released</th>
            <th className="px-3 py-2 text-right">Avg days</th>
          </tr>
        </thead>
        <tbody>
          {error && <ErrorRow colSpan={3} message={error} />}
          {!error && rows.length === 0 && (
            <EmptyRow colSpan={3} message="No released consignments at any ICD yet." />
          )}
          {!error &&
            rows.map((r) => (
              <tr
                key={r.icd_id ?? r.icd_name ?? ""}
                className="border-b border-border last:border-0 hover:bg-muted/10"
              >
                <td className="px-3 py-2 text-foreground">{r.icd_name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.released_count ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {r.avg_days ?? "—"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Pipeline Bottleneck — v_pipeline_funnel
// ──────────────────────────────────────────────────────────────────────────

function PipelineFunnelReport({
  payload,
  filters,
}: {
  payload: Extract<ReportPayload, { kind: "pipeline_funnel" }>;
  filters: ReportFilters;
}) {
  const { funnel, error } = payload;
  const total = funnel?.total_active ?? 0;

  return (
    <>
      <ReportHeader
        title={reportTitle("pipeline_funnel", filters)}
        subtitle="Consignments sitting in Action at each stage. The stage with the highest count is where things are stalling."
        exportHref={exportHref("pipeline_funnel", filters)}
        exportHrefPdf={exportHrefPdf("pipeline_funnel", filters)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-right">In Action</th>
            <th className="px-3 py-2 text-right">% of total active</th>
          </tr>
        </thead>
        <tbody>
          {error && <ErrorRow colSpan={3} message={error} />}
          {!error && !funnel && (
            <EmptyRow colSpan={3} message={`No funnel data for ${filters.year}.`} />
          )}
          {!error &&
            funnel &&
            FUNNEL_STAGES.map((s) => {
              const value = Number(funnel[s.key] ?? 0);
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <tr
                  key={s.key}
                  className="border-b border-border last:border-0 hover:bg-muted/10"
                >
                  <td className="px-3 py-2 text-foreground">{s.label}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                    {value}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {value > 0 ? `${pct}%` : "—"}
                  </td>
                </tr>
              );
            })}
          {!error && funnel && (
            <TotalRow
              cells={[
                { value: "Total active" },
                { value: total, align: "right", mono: true },
                { value: "", align: "right" },
              ]}
            />
          )}
        </tbody>
      </table>
      {!error && funnel && (
        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground flex justify-between">
          <span>
            Released this year:{" "}
            <strong className="text-stage-done font-semibold">
              {funnel.released ?? 0}
            </strong>
          </span>
          <span>
            Total active:{" "}
            <strong className="text-foreground font-semibold">{total}</strong>
          </span>
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 6. Pending Refunds — v_pending_refunds
// ──────────────────────────────────────────────────────────────────────────

function PendingRefundsReport({
  payload,
  filters,
}: {
  payload: Extract<ReportPayload, { kind: "pending_refunds" }>;
  filters: ReportFilters;
}) {
  const { rows, error } = payload;
  const { from, to } = filters;
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <>
      <ReportHeader
        title={reportTitle("pending_refunds", filters)}
        subtitle={
          from || to
            ? `Filtered by release_date${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`
            : "Consignments where remarks contained PAID / REFUND NEEDED. Source: v_pending_refunds."
        }
        exportHref={exportHref("pending_refunds", filters)}
        exportHrefPdf={exportHrefPdf("pending_refunds", filters)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
            <th className="px-3 py-2 text-left">REF No</th>
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-left">Release date</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-left">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {error && <ErrorRow colSpan={5} message={error} />}
          {!error && rows.length === 0 && (
            <EmptyRow colSpan={5} message="✅ No pending refunds for this period." />
          )}
          {!error &&
            rows.map((r) => (
              <tr
                key={r.id ?? `${r.ref_no}-${r.year}`}
                className="border-b border-border last:border-0 hover:bg-muted/10"
              >
                <td className="px-3 py-2 font-mono text-xs font-semibold text-foreground">
                  {r.ref_no ?? "—"}
                </td>
                <td className="px-3 py-2 text-foreground">{r.client_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(r.release_date)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {formatTzs(r.amount)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-md truncate">
                  {r.remarks ?? "—"}
                </td>
              </tr>
            ))}
          {!error && rows.length > 0 && (
            <TotalRow
              cells={[
                { value: "Total" },
                { value: "" },
                { value: "" },
                { value: formatTzs(totalAmount), align: "right", mono: true },
                { value: "" },
              ]}
            />
          )}
        </tbody>
      </table>
    </>
  );
}

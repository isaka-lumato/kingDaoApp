/**
 * Pure PDF element builder for `/reports` exports (T-072). No file I/O — the
 * caller (Route Handler) is responsible for `renderToBuffer` and shipping the
 * bytes. Mirrors `build-xlsx.ts` (T-071) in structure.
 *
 * Output contract:
 *  - One A4 landscape page (auto-paginates with the doc).
 *  - Fixed page header: Kingdao logo on the left, report title + filter
 *    summary on the right, repeated on each page via react-pdf's `fixed`.
 *  - Per-report table component switched on `payload.kind`.
 *  - Money cells use `formatTzs` from `@/lib/money`.
 *  - Date cells use yyyy-mm-dd (matches XLSX behaviour).
 *  - Empty result shows "No rows matched the filter."
 *
 * Tested in `tests/unit/build-pdf.test.tsx`.
 */

import * as React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatTzs } from "@/lib/money";
import {
  FUNNEL_STAGES,
  reportTitle,
  type ReportFilters,
  type ReportPayload,
  type RevenueRow,
  type ClientVolumeRow,
  type TurnaroundClientRow,
  type TurnaroundIcdRow,
  type PendingRefundRow,
  type PipelineFunnelData,
} from "./report-types";

// Load the logo once. The repo root is the cwd at runtime in dev and in the
// built server bundle (`process.cwd()` resolves to the project dir on Vercel).
// If the file is missing we fall back to no-logo rather than crashing the
// export — the test bench runs without spinning up the server, so the catch
// also keeps unit tests from failing if cwd is set strangely.
let LOGO_BUFFER: Buffer | null = null;
try {
  LOGO_BUFFER = readFileSync(join(process.cwd(), "KINGDAO_LOGO.png"));
} catch {
  LOGO_BUFFER = null;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 36,
    paddingHorizontal: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    position: "absolute",
    top: 20,
    left: 30,
    right: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: 1,
    borderBottomColor: "#9CA3AF",
    paddingBottom: 8,
  },
  logo: { width: 36, height: 36 },
  headerTextCol: { flexDirection: "column", alignItems: "flex-end" },
  headerTitle: { fontSize: 12, fontWeight: 700, color: "#111827" },
  headerSubtitle: { fontSize: 8, color: "#6B7280", marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#9CA3AF",
  },
  table: { width: "100%" },
  row: {
    flexDirection: "row",
    borderBottom: 0.5,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  totalsRow: {
    flexDirection: "row",
    borderTop: 1,
    borderTopColor: "#9CA3AF",
    paddingTop: 5,
    paddingBottom: 5,
    fontWeight: 700,
  },
  cell: { paddingHorizontal: 4 },
  cellHead: { fontWeight: 700, fontSize: 9 },
  cellRight: { textAlign: "right" },
  emptyText: { fontStyle: "italic", color: "#6B7280", marginTop: 16 },
});

function filterSummary({ year, from, to }: ReportFilters): string {
  const parts = [`Year: ${year}`];
  if (from) parts.push(`From: ${from}`);
  if (to) parts.push(`To: ${to}`);
  return parts.join(" · ");
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function PageFrame({
  title,
  filters,
  children,
}: {
  title: string;
  filters: ReportFilters;
  children: React.ReactNode;
}) {
  const generated = `Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header} fixed>
        {LOGO_BUFFER ? (
          <Image src={LOGO_BUFFER} style={styles.logo} />
        ) : (
          <View style={styles.logo} />
        )}
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>
            {generated} — {filterSummary(filters)}
          </Text>
        </View>
      </View>
      {children}
      <View style={styles.footer} fixed>
        <Text>KDL Tracker</Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

// ─── Table primitives ──────────────────────────────────────────────────────

type Col<T> = {
  header: string;
  /** Flex basis as a fraction of total table width. */
  flex: number;
  align?: "left" | "right";
  value: (row: T) => string;
};

function HeaderRow<T>({ columns }: { columns: Col<T>[] }) {
  return (
    <View style={styles.headerRow} fixed>
      {columns.map((c, i) => (
        <Text
          key={i}
          style={[
            styles.cell,
            styles.cellHead,
            { flex: c.flex },
            c.align === "right" ? styles.cellRight : {},
          ]}
        >
          {c.header}
        </Text>
      ))}
    </View>
  );
}

function DataRow<T>({ row, columns }: { row: T; columns: Col<T>[] }) {
  return (
    <View style={styles.row} wrap={false}>
      {columns.map((c, i) => (
        <Text
          key={i}
          style={[
            styles.cell,
            { flex: c.flex },
            c.align === "right" ? styles.cellRight : {},
          ]}
        >
          {c.value(row)}
        </Text>
      ))}
    </View>
  );
}

function TotalsRow({
  cells,
  flexes,
}: {
  cells: string[];
  flexes: number[];
}) {
  return (
    <View style={styles.totalsRow} wrap={false}>
      {cells.map((v, i) => (
        <Text
          key={i}
          style={[styles.cell, { flex: flexes[i] ?? 1, fontWeight: 700 }]}
        >
          {v}
        </Text>
      ))}
    </View>
  );
}

function EmptyState() {
  return <Text style={styles.emptyText}>No rows matched the filter.</Text>;
}

// ─── Per-report tables ─────────────────────────────────────────────────────

function RevenueTable({ rows }: { rows: RevenueRow[] }) {
  const columns: Col<RevenueRow>[] = [
    { header: "Month", flex: 2, value: (r) => r.month_label ?? "" },
    {
      header: "Released consignments",
      flex: 2,
      align: "right",
      value: (r) => String(num(r.consignment_count)),
    },
    {
      header: "Total revenue",
      flex: 2,
      align: "right",
      value: (r) => formatTzs(num(r.total_amount)),
    },
  ];
  if (rows.length === 0) return <EmptyState />;
  const totalCount = rows.reduce((s, r) => s + num(r.consignment_count), 0);
  const totalAmount = rows.reduce((s, r) => s + num(r.total_amount), 0);
  return (
    <View style={styles.table}>
      <HeaderRow columns={columns} />
      {rows.map((r, i) => (
        <DataRow key={i} row={r} columns={columns} />
      ))}
      <TotalsRow
        cells={["TOTAL", String(totalCount), formatTzs(totalAmount)]}
        flexes={columns.map((c) => c.flex)}
      />
    </View>
  );
}

function ClientVolumeTable({ rows }: { rows: ClientVolumeRow[] }) {
  const columns: Col<ClientVolumeRow>[] = [
    { header: "Client", flex: 3, value: (r) => r.client_name ?? "" },
    { header: "Sub-label", flex: 2, value: (r) => r.sub_label ?? "" },
    {
      header: "Jobs",
      flex: 1,
      align: "right",
      value: (r) => String(num(r.job_count)),
    },
    {
      header: "Containers",
      flex: 1.2,
      align: "right",
      value: (r) => String(num(r.total_containers)),
    },
    {
      header: "Released",
      flex: 1.2,
      align: "right",
      value: (r) => String(num(r.released_count)),
    },
    {
      header: "Active",
      flex: 1,
      align: "right",
      value: (r) => String(num(r.active_count)),
    },
    {
      header: "Total revenue",
      flex: 2,
      align: "right",
      value: (r) => formatTzs(num(r.total_revenue)),
    },
  ];
  if (rows.length === 0) return <EmptyState />;
  const totals = rows.reduce(
    (acc, r) => ({
      jobs: acc.jobs + num(r.job_count),
      containers: acc.containers + num(r.total_containers),
      revenue: acc.revenue + num(r.total_revenue),
    }),
    { jobs: 0, containers: 0, revenue: 0 },
  );
  return (
    <View style={styles.table}>
      <HeaderRow columns={columns} />
      {rows.map((r, i) => (
        <DataRow key={i} row={r} columns={columns} />
      ))}
      <TotalsRow
        cells={[
          "TOTAL",
          "",
          String(totals.jobs),
          String(totals.containers),
          "",
          "",
          formatTzs(totals.revenue),
        ]}
        flexes={columns.map((c) => c.flex)}
      />
    </View>
  );
}

function TurnaroundClientTable({ rows }: { rows: TurnaroundClientRow[] }) {
  const columns: Col<TurnaroundClientRow>[] = [
    { header: "Client", flex: 3, value: (r) => r.client_name ?? "" },
    { header: "Sub-label", flex: 2, value: (r) => r.sub_label ?? "" },
    {
      header: "Released",
      flex: 1.2,
      align: "right",
      value: (r) => String(num(r.released_count)),
    },
    {
      header: "Avg days",
      flex: 1.2,
      align: "right",
      value: (r) => String(num(r.avg_days)),
    },
    {
      header: "Min days",
      flex: 1.2,
      align: "right",
      value: (r) => String(num(r.min_days)),
    },
    {
      header: "Max days",
      flex: 1.2,
      align: "right",
      value: (r) => String(num(r.max_days)),
    },
  ];
  if (rows.length === 0) return <EmptyState />;
  return (
    <View style={styles.table}>
      <HeaderRow columns={columns} />
      {rows.map((r, i) => (
        <DataRow key={i} row={r} columns={columns} />
      ))}
    </View>
  );
}

function TurnaroundIcdTable({ rows }: { rows: TurnaroundIcdRow[] }) {
  const columns: Col<TurnaroundIcdRow>[] = [
    { header: "ICD", flex: 3, value: (r) => r.icd_name ?? "" },
    {
      header: "Released",
      flex: 1.5,
      align: "right",
      value: (r) => String(num(r.released_count)),
    },
    {
      header: "Avg days",
      flex: 1.5,
      align: "right",
      value: (r) => String(num(r.avg_days)),
    },
  ];
  if (rows.length === 0) return <EmptyState />;
  return (
    <View style={styles.table}>
      <HeaderRow columns={columns} />
      {rows.map((r, i) => (
        <DataRow key={i} row={r} columns={columns} />
      ))}
    </View>
  );
}

function PipelineFunnelTable({ funnel }: { funnel: PipelineFunnelData | null }) {
  const total = num(funnel?.total_active);
  const rows = FUNNEL_STAGES.map((s) => {
    const value = funnel ? num(funnel[s.key]) : 0;
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return { label: s.label, value, pct };
  });
  const columns: Col<(typeof rows)[number]>[] = [
    { header: "Stage", flex: 3, value: (r) => r.label },
    {
      header: "In Action",
      flex: 1.5,
      align: "right",
      value: (r) => String(r.value),
    },
    {
      header: "% of total active",
      flex: 2,
      align: "right",
      value: (r) => `${r.pct}%`,
    },
  ];
  return (
    <View style={styles.table}>
      <HeaderRow columns={columns} />
      {rows.map((r, i) => (
        <DataRow key={i} row={r} columns={columns} />
      ))}
      <TotalsRow
        cells={[
          "TOTAL ACTIVE",
          String(total),
          funnel ? `Released: ${num(funnel.released)}` : "",
        ]}
        flexes={columns.map((c) => c.flex)}
      />
    </View>
  );
}

function PendingRefundsTable({ rows }: { rows: PendingRefundRow[] }) {
  const columns: Col<PendingRefundRow>[] = [
    { header: "REF No", flex: 1.5, value: (r) => r.ref_no ?? "" },
    {
      header: "Year",
      flex: 1,
      align: "right",
      value: (r) => String(num(r.year)),
    },
    { header: "Client", flex: 3, value: (r) => r.client_name ?? "" },
    {
      header: "Release date",
      flex: 1.5,
      value: (r) => r.release_date ?? "",
    },
    {
      header: "Amount",
      flex: 2,
      align: "right",
      value: (r) => formatTzs(num(r.amount)),
    },
    { header: "Remarks", flex: 3, value: (r) => r.remarks ?? "" },
  ];
  if (rows.length === 0) return <EmptyState />;
  const totalAmount = rows.reduce((s, r) => s + num(r.amount), 0);
  return (
    <View style={styles.table}>
      <HeaderRow columns={columns} />
      {rows.map((r, i) => (
        <DataRow key={i} row={r} columns={columns} />
      ))}
      <TotalsRow
        cells={["TOTAL", "", "", "", formatTzs(totalAmount), ""]}
        flexes={columns.map((c) => c.flex)}
      />
    </View>
  );
}

// ─── Public entry ──────────────────────────────────────────────────────────

export function buildReportPdf(
  payload: ReportPayload,
  filters: ReportFilters,
): React.ReactElement {
  const title = reportTitle(payload.kind, filters);
  let body: React.ReactElement;
  switch (payload.kind) {
    case "revenue":
      body = <RevenueTable rows={payload.rows} />;
      break;
    case "client_volume":
      body = <ClientVolumeTable rows={payload.rows} />;
      break;
    case "turnaround_client":
      body = <TurnaroundClientTable rows={payload.rows} />;
      break;
    case "turnaround_icd":
      body = <TurnaroundIcdTable rows={payload.rows} />;
      break;
    case "pipeline_funnel":
      body = <PipelineFunnelTable funnel={payload.funnel} />;
      break;
    case "pending_refunds":
      body = <PendingRefundsTable rows={payload.rows} />;
      break;
  }
  return (
    <Document title={title} author="KDL Tracker">
      <PageFrame title={title} filters={filters}>
        {body}
      </PageFrame>
    </Document>
  );
}

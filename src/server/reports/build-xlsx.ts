import ExcelJS from "exceljs";
import {
  FUNNEL_STAGES,
  reportTitle,
  type ReportFilters,
  type ReportPayload,
} from "./report-types";

/**
 * Pure workbook builder for `/reports` exports (T-071). No file I/O — the
 * caller (Route Handler) is responsible for `workbook.xlsx.writeBuffer()` and
 * shipping the bytes.
 *
 * Output contract:
 *  - One sheet named after the report (Excel caps sheet names at 31 chars).
 *  - Row 1: report title. Row 2: generated-at + filter summary. Row 3: blank.
 *  - Row 4: bold + frozen column headers. Row 5+: data. Then a `TOTAL` row
 *    where the page shows one.
 *  - Money columns: numeric value with format `"TSh"#,##0`.
 *  - Date columns: real `Date` cell with format `yyyy-mm-dd`.
 *  - Empty result still produces a valid workbook with header + a "No rows
 *    matched the filter." sentinel — matches the page's `EmptyRow`.
 *
 * Tested in `tests/unit/build-xlsx.test.ts`.
 */

const MONEY_FMT = '"TSh"#,##0';
const DATE_FMT = "yyyy-mm-dd";

type ColumnSpec<T> = {
  header: string;
  width?: number;
  /** When set, the cell uses this Excel number format. */
  numFmt?: string;
  /** Project a row to its cell value. Strings/numbers/Dates pass through. */
  value: (row: T) => string | number | Date | null;
};

function sheetNameFor(title: string): string {
  // Excel forbids: \ / ? * [ ] : and caps name length at 31.
  // We also strip the middle-dot we use cosmetically in titles so it survives
  // older Excel locales that render it as "·" garbled.
  const cleaned = title.replace(/[\\/?*[\]:]/g, "").replace(/·/g, "-");
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

function filterSummary({ year, from, to }: ReportFilters): string {
  const parts = [`Year: ${year}`];
  if (from) parts.push(`From: ${from}`);
  if (to) parts.push(`To: ${to}`);
  return parts.join(" · ");
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }, // tailwind gray-200
    };
    cell.alignment = { vertical: "middle" };
  });
}

function applyTotalStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
  });
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Use UTC midnight to avoid TZ shifts pulling the date back a day in Excel.
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Render a table-shaped report (everything except pipeline funnel which has a
 * fixed 10-row structure). Returns the data row count actually written.
 */
function renderTable<T>(
  sheet: ExcelJS.Worksheet,
  rows: T[],
  columns: ColumnSpec<T>[],
  totalsRow: Array<string | number | { value: number; numFmt: string }> | null,
): number {
  // Set column widths and headers.
  sheet.columns = columns.map((c) => ({
    header: c.header,
    width: c.width ?? 18,
  }));

  // The header row was written by `sheet.columns` — apply styling on row 1
  // (we'll shift it to row 4 below by prefixing the title rows). For now we
  // emit the header on the current first row; the caller wraps this in the
  // title/blank rows.
  applyHeaderStyle(sheet.getRow(1));

  if (rows.length === 0) {
    const empty = sheet.addRow([]);
    empty.getCell(1).value = "No rows matched the filter.";
    empty.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
    return 0;
  }

  for (const row of rows) {
    const values = columns.map((c) => c.value(row) ?? null);
    const r = sheet.addRow(values);
    r.eachCell((cell, colNumber) => {
      const spec = columns[colNumber - 1];
      if (spec?.numFmt) cell.numFmt = spec.numFmt;
    });
  }

  if (totalsRow) {
    const flat = totalsRow.map((c) => (typeof c === "object" ? c.value : c));
    const r = sheet.addRow(flat);
    totalsRow.forEach((c, i) => {
      if (typeof c === "object") {
        r.getCell(i + 1).numFmt = c.numFmt;
      }
    });
    applyTotalStyle(r);
  }

  return rows.length;
}

/**
 * Prepend the title + filter-summary banner. Returns the sheet with the
 * column headers shifted to row 4.
 *
 * ExcelJS's `sheet.columns` writes the header on row 1, so we build the table
 * on the sheet first (rows 1..N), then `spliceRows(1, 0, …)` to insert the
 * banner above. That keeps the column-width metadata intact while moving the
 * actual cells down.
 */
function prependBanner(
  sheet: ExcelJS.Worksheet,
  title: string,
  filters: ReportFilters,
) {
  const generated = `Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
  // Insert 3 rows at the top: title, meta, blank.
  sheet.spliceRows(1, 0, [title], [`${generated} — ${filterSummary(filters)}`], []);
  // Style the title row.
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  // Re-apply header style on what is now row 4.
  applyHeaderStyle(sheet.getRow(4));
  // Freeze first 4 rows.
  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

// ─── Per-report builders ───────────────────────────────────────────────────

function buildRevenueSheet(
  wb: ExcelJS.Workbook,
  payload: Extract<ReportPayload, { kind: "revenue" }>,
  filters: ReportFilters,
) {
  const title = reportTitle("revenue", filters);
  const sheet = wb.addWorksheet(sheetNameFor(title));
  const columns: ColumnSpec<(typeof payload.rows)[number]>[] = [
    { header: "Month", width: 22, value: (r) => r.month_label ?? "" },
    {
      header: "Released consignments",
      width: 22,
      value: (r) => num(r.consignment_count),
    },
    {
      header: "Total revenue",
      width: 22,
      numFmt: MONEY_FMT,
      value: (r) => num(r.total_amount),
    },
  ];
  const totalCount = payload.rows.reduce(
    (s, r) => s + num(r.consignment_count),
    0,
  );
  const totalAmount = payload.rows.reduce(
    (s, r) => s + num(r.total_amount),
    0,
  );
  renderTable(
    sheet,
    payload.rows,
    columns,
    payload.rows.length > 0
      ? ["TOTAL", totalCount, { value: totalAmount, numFmt: MONEY_FMT }]
      : null,
  );
  prependBanner(sheet, title, filters);
}

function buildClientVolumeSheet(
  wb: ExcelJS.Workbook,
  payload: Extract<ReportPayload, { kind: "client_volume" }>,
  filters: ReportFilters,
) {
  const title = reportTitle("client_volume", filters);
  const sheet = wb.addWorksheet(sheetNameFor(title));
  const columns: ColumnSpec<(typeof payload.rows)[number]>[] = [
    { header: "Client", width: 32, value: (r) => r.client_name ?? "" },
    { header: "Sub-label", width: 26, value: (r) => r.sub_label ?? "" },
    { header: "Jobs", width: 10, value: (r) => num(r.job_count) },
    { header: "Containers", width: 12, value: (r) => num(r.total_containers) },
    { header: "Released", width: 12, value: (r) => num(r.released_count) },
    { header: "Active", width: 10, value: (r) => num(r.active_count) },
    {
      header: "Total revenue",
      width: 18,
      numFmt: MONEY_FMT,
      value: (r) => num(r.total_revenue),
    },
  ];
  const totals = payload.rows.reduce(
    (acc, r) => ({
      jobs: acc.jobs + num(r.job_count),
      containers: acc.containers + num(r.total_containers),
      revenue: acc.revenue + num(r.total_revenue),
    }),
    { jobs: 0, containers: 0, revenue: 0 },
  );
  renderTable(
    sheet,
    payload.rows,
    columns,
    payload.rows.length > 0
      ? [
          "TOTAL",
          "",
          totals.jobs,
          totals.containers,
          "",
          "",
          { value: totals.revenue, numFmt: MONEY_FMT },
        ]
      : null,
  );
  prependBanner(sheet, title, filters);
}

function buildTurnaroundClientSheet(
  wb: ExcelJS.Workbook,
  payload: Extract<ReportPayload, { kind: "turnaround_client" }>,
  filters: ReportFilters,
) {
  const title = reportTitle("turnaround_client", filters);
  const sheet = wb.addWorksheet(sheetNameFor(title));
  const columns: ColumnSpec<(typeof payload.rows)[number]>[] = [
    { header: "Client", width: 32, value: (r) => r.client_name ?? "" },
    { header: "Sub-label", width: 26, value: (r) => r.sub_label ?? "" },
    { header: "Released", width: 12, value: (r) => num(r.released_count) },
    { header: "Avg days", width: 12, value: (r) => num(r.avg_days) },
    { header: "Min days", width: 12, value: (r) => num(r.min_days) },
    { header: "Max days", width: 12, value: (r) => num(r.max_days) },
  ];
  renderTable(sheet, payload.rows, columns, null);
  prependBanner(sheet, title, filters);
}

function buildTurnaroundIcdSheet(
  wb: ExcelJS.Workbook,
  payload: Extract<ReportPayload, { kind: "turnaround_icd" }>,
  filters: ReportFilters,
) {
  const title = reportTitle("turnaround_icd", filters);
  const sheet = wb.addWorksheet(sheetNameFor(title));
  const columns: ColumnSpec<(typeof payload.rows)[number]>[] = [
    { header: "ICD", width: 32, value: (r) => r.icd_name ?? "" },
    { header: "Released", width: 12, value: (r) => num(r.released_count) },
    { header: "Avg days", width: 12, value: (r) => num(r.avg_days) },
  ];
  renderTable(sheet, payload.rows, columns, null);
  prependBanner(sheet, title, filters);
}

function buildPipelineFunnelSheet(
  wb: ExcelJS.Workbook,
  payload: Extract<ReportPayload, { kind: "pipeline_funnel" }>,
  filters: ReportFilters,
) {
  const title = reportTitle("pipeline_funnel", filters);
  const sheet = wb.addWorksheet(sheetNameFor(title));
  const funnel = payload.funnel;
  const total = num(funnel?.total_active);
  // Build a synthetic rows array so we can reuse renderTable.
  const rows = FUNNEL_STAGES.map((s) => {
    const value = funnel ? num(funnel[s.key]) : 0;
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return { label: s.label, value, pct };
  });
  const columns: ColumnSpec<(typeof rows)[number]>[] = [
    { header: "Stage", width: 22, value: (r) => r.label },
    { header: "In Action", width: 12, value: (r) => r.value },
    { header: "% of total active", width: 18, value: (r) => `${r.pct}%` },
  ];
  renderTable(sheet, rows, columns, [
    "TOTAL ACTIVE",
    total,
    funnel ? `Released: ${num(funnel.released)}` : "",
  ]);
  prependBanner(sheet, title, filters);
}

function buildPendingRefundsSheet(
  wb: ExcelJS.Workbook,
  payload: Extract<ReportPayload, { kind: "pending_refunds" }>,
  filters: ReportFilters,
) {
  const title = reportTitle("pending_refunds", filters);
  const sheet = wb.addWorksheet(sheetNameFor(title));
  const columns: ColumnSpec<(typeof payload.rows)[number]>[] = [
    { header: "REF No", width: 14, value: (r) => r.ref_no ?? "" },
    { header: "Year", width: 8, value: (r) => num(r.year) },
    { header: "Client", width: 32, value: (r) => r.client_name ?? "" },
    {
      header: "Release date",
      width: 14,
      numFmt: DATE_FMT,
      value: (r) => asDate(r.release_date),
    },
    {
      header: "Amount",
      width: 18,
      numFmt: MONEY_FMT,
      value: (r) => num(r.amount),
    },
    { header: "Remarks", width: 40, value: (r) => r.remarks ?? "" },
  ];
  const totalAmount = payload.rows.reduce((s, r) => s + num(r.amount), 0);
  renderTable(
    sheet,
    payload.rows,
    columns,
    payload.rows.length > 0
      ? ["TOTAL", "", "", "", { value: totalAmount, numFmt: MONEY_FMT }, ""]
      : null,
  );
  prependBanner(sheet, title, filters);
}

// ─── Public entry ──────────────────────────────────────────────────────────

export function buildReportWorkbook(
  payload: ReportPayload,
  filters: ReportFilters,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KDL Tracker";
  wb.created = new Date();

  switch (payload.kind) {
    case "revenue":
      buildRevenueSheet(wb, payload, filters);
      break;
    case "client_volume":
      buildClientVolumeSheet(wb, payload, filters);
      break;
    case "turnaround_client":
      buildTurnaroundClientSheet(wb, payload, filters);
      break;
    case "turnaround_icd":
      buildTurnaroundIcdSheet(wb, payload, filters);
      break;
    case "pipeline_funnel":
      buildPipelineFunnelSheet(wb, payload, filters);
      break;
    case "pending_refunds":
      buildPendingRefundsSheet(wb, payload, filters);
      break;
  }
  return wb;
}

// Re-export for tests that want to assert sheet name behaviour without
// having to mirror the cleaning logic.
export { sheetNameFor as __sheetNameFor };

import { describe, expect, it } from "vitest";
import {
  buildReportWorkbook,
  __sheetNameFor,
} from "@/server/reports/build-xlsx";
import type {
  ReportFilters,
  ReportPayload,
} from "@/server/reports/report-types";

/**
 * Pure-function tests for the XLSX builder (T-071). The builder must:
 *  - Emit one sheet per report.
 *  - Use real `number` cells with money/date numFmts (not formatted strings).
 *  - Include header + data + totals row exactly where the page does.
 *  - Survive empty results with a sentinel row instead of throwing.
 *
 * Row layout enforced by `prependBanner`:
 *   row 1: title, row 2: meta, row 3: blank, row 4: headers, row 5+: data.
 */

const FILTERS_BASE: ReportFilters = { year: 2026, from: null, to: null };
const FILTERS_RANGE: ReportFilters = {
  year: 2026,
  from: "2026-01-01",
  to: "2026-03-31",
};

const MONEY_FMT = '"TSh"#,##0';
const DATE_FMT = "yyyy-mm-dd";

describe("__sheetNameFor", () => {
  it("strips forbidden characters", () => {
    expect(__sheetNameFor("Foo/Bar?Baz")).toBe("FooBarBaz");
  });

  it("replaces · with - for older Excel locales", () => {
    expect(__sheetNameFor("Revenue · 2026")).toBe("Revenue - 2026");
  });

  it("caps at 31 characters", () => {
    const out = __sheetNameFor("A".repeat(50));
    expect(out.length).toBe(31);
  });
});

describe("buildReportWorkbook · revenue", () => {
  const payload: ReportPayload = {
    kind: "revenue",
    rows: [
      {
        year: 2026,
        month: "2026-01-01",
        month_label: "Jan 2026",
        consignment_count: 3,
        total_amount: 900_000,
      },
      {
        year: 2026,
        month: "2026-02-01",
        month_label: "Feb 2026",
        consignment_count: 5,
        total_amount: 1_500_000,
      },
    ],
    error: null,
  };

  it("produces one sheet with title + headers + data + totals", () => {
    const wb = buildReportWorkbook(payload, FILTERS_BASE);
    expect(wb.worksheets.length).toBe(1);
    const sheet = wb.worksheets[0]!;

    // Row 1: title (uses the full title verbatim — only the sheet name strips ·).
    expect(sheet.getRow(1).getCell(1).value).toBe("Revenue Summary · 2026");
    // Sheet name strips the middle-dot for older Excel locale safety.
    expect(sheet.name).toBe("Revenue Summary - 2026");
    // Row 4 holds headers.
    expect(sheet.getRow(4).getCell(1).value).toBe("Month");
    expect(sheet.getRow(4).getCell(2).value).toBe("Released consignments");
    expect(sheet.getRow(4).getCell(3).value).toBe("Total revenue");

    // First data row.
    expect(sheet.getRow(5).getCell(1).value).toBe("Jan 2026");
    expect(sheet.getRow(5).getCell(2).value).toBe(3);
    expect(sheet.getRow(5).getCell(3).value).toBe(900_000);
    expect(sheet.getRow(5).getCell(3).numFmt).toBe(MONEY_FMT);

    // Totals row appears after the two data rows.
    const totalRow = sheet.getRow(7);
    expect(totalRow.getCell(1).value).toBe("TOTAL");
    expect(totalRow.getCell(2).value).toBe(8); // 3 + 5
    expect(totalRow.getCell(3).value).toBe(2_400_000); // 900k + 1.5M
    expect(totalRow.getCell(3).numFmt).toBe(MONEY_FMT);
  });

  it("emits an empty-sentinel row when there are no rows", () => {
    const empty: ReportPayload = { kind: "revenue", rows: [], error: null };
    const wb = buildReportWorkbook(empty, FILTERS_RANGE);
    const sheet = wb.worksheets[0]!;
    // Row 5 should carry the "No rows matched the filter." sentinel.
    expect(sheet.getRow(5).getCell(1).value).toContain("No rows matched");
  });

  it("includes filter range in row 2 when supplied", () => {
    const wb = buildReportWorkbook(payload, FILTERS_RANGE);
    const sheet = wb.worksheets[0]!;
    const meta = sheet.getRow(2).getCell(1).value as string;
    expect(meta).toContain("From: 2026-01-01");
    expect(meta).toContain("To: 2026-03-31");
  });
});

describe("buildReportWorkbook · client_volume totals row", () => {
  const payload: ReportPayload = {
    kind: "client_volume",
    rows: [
      {
        client_id: "c1",
        client_name: "Acme Co",
        sub_label: null,
        job_count: 4,
        total_containers: 12,
        total_revenue: 2_000_000,
        released_count: 3,
        active_count: 1,
      },
      {
        client_id: "c2",
        client_name: "Beta Co",
        sub_label: "subsidiary",
        job_count: 2,
        total_containers: 5,
        total_revenue: 800_000,
        released_count: 2,
        active_count: 0,
      },
    ],
    error: null,
  };

  it("sums jobs, containers, and revenue", () => {
    const wb = buildReportWorkbook(payload, FILTERS_BASE);
    const sheet = wb.worksheets[0]!;
    // 7-column layout, totals at row 7.
    const totalRow = sheet.getRow(7);
    expect(totalRow.getCell(1).value).toBe("TOTAL");
    expect(totalRow.getCell(3).value).toBe(6); // jobs
    expect(totalRow.getCell(4).value).toBe(17); // containers
    expect(totalRow.getCell(7).value).toBe(2_800_000); // revenue
    expect(totalRow.getCell(7).numFmt).toBe(MONEY_FMT);
  });
});

describe("buildReportWorkbook · turnaround_client has no totals row", () => {
  const payload: ReportPayload = {
    kind: "turnaround_client",
    rows: [
      {
        client_id: "c1",
        client_name: "Acme Co",
        sub_label: null,
        released_count: 5,
        avg_days: 12,
        min_days: 6,
        max_days: 20,
      },
    ],
    error: null,
  };

  it("renders one data row at row 5 and no totals row", () => {
    const wb = buildReportWorkbook(payload, FILTERS_BASE);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(5).getCell(1).value).toBe("Acme Co");
    expect(sheet.getRow(5).getCell(4).value).toBe(12);
    // Row 6 should be empty (no totals row).
    expect(sheet.getRow(6).getCell(1).value).toBeFalsy();
  });
});

describe("buildReportWorkbook · pipeline_funnel uses 10 stages", () => {
  const payload: ReportPayload = {
    kind: "pipeline_funnel",
    funnel: {
      year: 2026,
      total_active: 100,
      released: 250,
      manifest_action: 20,
      shipping_action: 15,
      tanesws_action: 10,
      assessment_action: 8,
      tbs_loading_action: 12,
      tbs_debit_action: 5,
      manifest_comp_action: 7,
      duty_action: 6,
      inspection_action: 9,
      ready_to_release: 8,
    },
    error: null,
  };

  it("renders 10 stage rows + totals row", () => {
    const wb = buildReportWorkbook(payload, FILTERS_BASE);
    const sheet = wb.worksheets[0]!;
    // Stages occupy rows 5..14, totals at row 15.
    expect(sheet.getRow(5).getCell(1).value).toBe("Manifest");
    expect(sheet.getRow(5).getCell(2).value).toBe(20);
    expect(sheet.getRow(14).getCell(1).value).toBe("Ready to release");
    expect(sheet.getRow(14).getCell(2).value).toBe(8);
    const totalRow = sheet.getRow(15);
    expect(totalRow.getCell(1).value).toBe("TOTAL ACTIVE");
    expect(totalRow.getCell(2).value).toBe(100);
    expect(String(totalRow.getCell(3).value)).toContain("Released: 250");
  });

  it("survives missing funnel data with zeros", () => {
    const emptyPayload: ReportPayload = {
      kind: "pipeline_funnel",
      funnel: null,
      error: null,
    };
    const wb = buildReportWorkbook(emptyPayload, FILTERS_BASE);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(5).getCell(1).value).toBe("Manifest");
    expect(sheet.getRow(5).getCell(2).value).toBe(0);
  });
});

describe("buildReportWorkbook · pending_refunds dates + money", () => {
  const payload: ReportPayload = {
    kind: "pending_refunds",
    rows: [
      {
        id: "p1",
        ref_no: "9900042",
        year: 2026,
        client_name: "Acme Co",
        amount: 300_000,
        remarks: "PAID — REFUND NEEDED",
        release_date: "2026-02-10",
        created_at: "2026-02-10T00:00:00Z",
      },
    ],
    error: null,
  };

  it("renders date as Date with yyyy-mm-dd numFmt; money as numeric", () => {
    const wb = buildReportWorkbook(payload, FILTERS_BASE);
    const sheet = wb.worksheets[0]!;
    const row = sheet.getRow(5);
    expect(row.getCell(1).value).toBe("9900042");
    expect(row.getCell(2).value).toBe(2026);
    expect(row.getCell(3).value).toBe("Acme Co");
    // release_date — actual JS Date, not string.
    const dateCell = row.getCell(4);
    expect(dateCell.value).toBeInstanceOf(Date);
    expect(dateCell.numFmt).toBe(DATE_FMT);
    // Money cell.
    expect(row.getCell(5).value).toBe(300_000);
    expect(row.getCell(5).numFmt).toBe(MONEY_FMT);
    // Totals row at row 6: TOTAL, "", "", "", 300_000, ""
    const totalRow = sheet.getRow(6);
    expect(totalRow.getCell(1).value).toBe("TOTAL");
    expect(totalRow.getCell(5).value).toBe(300_000);
    expect(totalRow.getCell(5).numFmt).toBe(MONEY_FMT);
  });
});

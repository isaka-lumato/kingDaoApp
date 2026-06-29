import { describe, expect, it } from "vitest";
import { buildConsignmentsWorkbook } from "@/server/consignments/build-consignments-xlsx";
import {
  EXPORT_COLUMNS,
  AMOUNT_COLUMN_INDEX,
  type ExportRow,
  type ExportFilters,
} from "@/server/consignments/export-columns";

/**
 * Pure-function tests for the consignments XLSX builder (D-056). Mirrors the
 * reports build-xlsx test. Banner layout (from `spliceRows`):
 *   row 1: title · row 2: meta · row 3: blank · row 4: headers · row 5+: data.
 */

const MONEY_FMT = '"TSh"#,##0';
const DATE_FMT = "yyyy-mm-dd";

const FILTERS: ExportFilters = {
  year: 2026,
  sort: "serial_no",
  dir: "asc",
};

// All 10 stage fields default to "Waiting" so currentStageLabel resolves to the
// first active stage; individual rows override as needed.
function makeRow(over: Partial<ExportRow>): ExportRow {
  return {
    manifest_status: "Waiting",
    shipping_batch_status: "Waiting",
    tanesws_status: "Waiting",
    assessment_status: "Waiting",
    tbs_loading_status: "Waiting",
    tbs_debit_status: "Waiting",
    manifest_comp_status: "Waiting",
    duty_status: "Waiting",
    inspection_file_status: "Waiting",
    release_status: "Waiting",
    ref_no: null,
    year: 2026,
    bl_number: null,
    tansad_no: null,
    vessel_name: null,
    arrival_date: null,
    cargo_count: null,
    cargo_type: null,
    efd_receipt_no: null,
    goods_description: null,
    amount: null,
    release_date: null,
    clients: null,
    ...over,
  };
}

describe("buildConsignmentsWorkbook", () => {
  const rows: ExportRow[] = [
    makeRow({
      ref_no: "9900001",
      clients: { id: "c1", name: "PAPA TRADING" },
      bl_number: "BL-111",
      arrival_date: "2026-02-10",
      amount: 900_000,
      manifest_status: "Uploaded",
    }),
    makeRow({
      ref_no: "9900002",
      clients: { id: "c2", name: "JOYCE LTD" },
      amount: 1_500_000,
    }),
  ];

  it("emits title, meta, headers, data, and a TOTAL row", () => {
    const wb = buildConsignmentsWorkbook(rows, FILTERS);
    expect(wb.worksheets.length).toBe(1);
    const sheet = wb.worksheets[0]!;

    // Banner.
    expect(sheet.getRow(1).getCell(1).value).toBe("Consignments · 2026");
    expect(String(sheet.getRow(2).getCell(1).value)).toContain("Year: 2026");

    // Headers on row 4.
    expect(sheet.getRow(4).getCell(1).value).toBe("Ref No");
    expect(sheet.getRow(4).getCell(EXPORT_COLUMNS.length).value).toBe(
      "Released On",
    );

    // First data row (row 5).
    expect(sheet.getRow(5).getCell(1).value).toBe("9900001");
    expect(sheet.getRow(5).getCell(3).value).toBe("PAPA TRADING");
    // Amount as numeric with money format.
    const amtCell = sheet.getRow(5).getCell(AMOUNT_COLUMN_INDEX + 1);
    expect(amtCell.value).toBe(900_000);
    expect(amtCell.numFmt).toBe(MONEY_FMT);

    // TOTAL row after the two data rows (row 7).
    const totalRow = sheet.getRow(7);
    expect(totalRow.getCell(1).value).toBe("TOTAL");
    expect(totalRow.getCell(AMOUNT_COLUMN_INDEX + 1).value).toBe(2_400_000);
    expect(totalRow.getCell(AMOUNT_COLUMN_INDEX + 1).numFmt).toBe(MONEY_FMT);
  });

  it("renders arrival as a real Date with yyyy-mm-dd numFmt", () => {
    const wb = buildConsignmentsWorkbook(rows, FILTERS);
    const sheet = wb.worksheets[0]!;
    const arrivalCol = EXPORT_COLUMNS.findIndex((c) => c.header === "Arrival");
    const cell = sheet.getRow(5).getCell(arrivalCol + 1);
    expect(cell.value).toBeInstanceOf(Date);
    expect(cell.numFmt).toBe(DATE_FMT);
  });

  it("includes search + sort in the meta banner", () => {
    const wb = buildConsignmentsWorkbook(rows, {
      ...FILTERS,
      q: "PAPA",
      stage: "unreleased",
      dir: "desc",
      sort: "amount",
    });
    const meta = String(wb.worksheets[0]!.getRow(2).getCell(1).value);
    expect(meta).toContain('Search: "PAPA"');
    expect(meta).toContain("Status: Unreleased");
    expect(meta).toContain("Sort: amount desc");
  });

  it("emits a sentinel row when there are no rows", () => {
    const wb = buildConsignmentsWorkbook([], FILTERS);
    const sheet = wb.worksheets[0]!;
    expect(String(sheet.getRow(5).getCell(1).value)).toContain(
      "No consignments matched",
    );
  });
});

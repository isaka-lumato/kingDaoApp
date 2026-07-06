import ExcelJS from "exceljs";
import { MASKED_AMOUNT } from "@/lib/money";
import {
  EXPORT_COLUMNS,
  AMOUNT_COLUMN_INDEX,
  exportFilterSummary,
  type ExportRow,
  type ExportFilters,
} from "./export-columns";

/**
 * Pure workbook builder for the consignments-list export (D-056). Mirrors the
 * reports XLSX builder (`@/server/reports/build-xlsx`): no file I/O — the route
 * handler calls `workbook.xlsx.writeBuffer()` and ships the bytes.
 *
 * Layout (matches the reports export so the two feel identical):
 *   row 1: title · row 2: generated-at + filter summary · row 3: blank
 *   row 4: bold frozen headers · row 5+: data · TOTAL row for Amount.
 *
 * Money cells are numeric with a `"TSh"#,##0` format; date cells are real
 * `Date`s with `yyyy-mm-dd`. Empty result still yields a valid workbook with a
 * sentinel row.
 *
 * Tested in `tests/unit/build-consignments-xlsx.test.ts`.
 */

const MONEY_FMT = '"TSh"#,##0';
const DATE_FMT = "yyyy-mm-dd";

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
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
  // UTC midnight to avoid a TZ shift pulling the date back a day in Excel.
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildConsignmentsWorkbook(
  rows: ExportRow[],
  filters: ExportFilters,
  clientName?: string,
  canSeeAmount = true,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KDL Tracker";
  wb.created = new Date();

  const sheet = wb.addWorksheet(`Consignments ${filters.year}`);

  sheet.columns = EXPORT_COLUMNS.map((c) => ({
    header: c.header,
    width: c.width,
  }));
  applyHeaderStyle(sheet.getRow(1));

  if (rows.length === 0) {
    const empty = sheet.addRow([]);
    empty.getCell(1).value = "No consignments matched the filter.";
    empty.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
  } else {
    for (const row of rows) {
      const values = EXPORT_COLUMNS.map((c) => {
        // Mask money cells for roles without "See financial amounts" (D-063).
        if (c.kind === "money" && !canSeeAmount) return MASKED_AMOUNT;
        if (c.kind === "date") return asDate(c.raw(row) as string | null);
        return c.raw(row);
      });
      const r = sheet.addRow(values);
      r.eachCell((cell, colNumber) => {
        const spec = EXPORT_COLUMNS[colNumber - 1];
        if (!spec) return;
        // Skip the money numFmt when masked — the cell holds a string, not a number.
        if (spec.kind === "money" && canSeeAmount) cell.numFmt = MONEY_FMT;
        if (spec.kind === "date") cell.numFmt = DATE_FMT;
      });
    }

    // TOTAL row summing Amount (masked when the role can't see amounts).
    const totalAmount = rows.reduce((s, r) => s + num(r.amount), 0);
    const totalCells: (string | number)[] = EXPORT_COLUMNS.map(() => "");
    totalCells[0] = "TOTAL";
    if (AMOUNT_COLUMN_INDEX >= 0) {
      totalCells[AMOUNT_COLUMN_INDEX] = canSeeAmount ? totalAmount : MASKED_AMOUNT;
    }
    const totalRow = sheet.addRow(totalCells);
    if (AMOUNT_COLUMN_INDEX >= 0 && canSeeAmount) {
      totalRow.getCell(AMOUNT_COLUMN_INDEX + 1).numFmt = MONEY_FMT;
    }
    applyTotalStyle(totalRow);
  }

  // Prepend the title/meta/blank banner above the table.
  const title = `Consignments · ${filters.year}`;
  const generated = `Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
  sheet.spliceRows(
    1,
    0,
    [title],
    [`${generated} — ${exportFilterSummary(filters, clientName)}`],
    [],
  );
  sheet.getRow(1).getCell(1).font = { bold: true, size: 14 };
  applyHeaderStyle(sheet.getRow(4));
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  return wb;
}

import { cargoLabel } from "@/lib/cargo";
import { formatTzs } from "@/lib/money";
import { currentStageLabel } from "@/lib/pipeline";
import type { StageField } from "@/lib/pipeline";

/**
 * Single source of truth for the consignments export columns, shared by the
 * XLSX builder (`build-consignments-xlsx.ts`) and the PDF builder
 * (`build-consignments-pdf.tsx`) so both formats stay in lock-step.
 *
 * Each column projects a normalized row to a typed cell value. The `kind`
 * drives format-specific rendering: XLSX uses it to pick a numFmt / emit a real
 * Date; PDF uses it to right-align money/number columns and stringify dates.
 */

export type ExportRow = Record<StageField, string> & {
  ref_no: string | null;
  year: number | null;
  bl_number: string | null;
  tansad_no: string | null;

  efd_receipt_no: string | null;
  vessel_name: string | null;
  arrival_date: string | null;
  cargo_count: number | null;
  cargo_type: string | null;
  goods_description: string | null;
  amount: number | null;
  release_status: string;
  release_date: string | null;
  clients: { id: string; name: string } | null;
};

export type CellKind = "text" | "number" | "money" | "date";

export type ExportColumn = {
  header: string;
  kind: CellKind;
  /** XLSX column width (chars). */
  width: number;
  /** PDF flex basis (fraction of table width). */
  flex: number;
  /** Raw value for XLSX: number for money/number, ISO date string for date. */
  raw: (row: ExportRow) => string | number | null;
  /** Pre-formatted display string (used by PDF + as the XLSX fallback). */
  text: (row: ExportRow) => string;
};

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  {
    header: "Ref No",
    kind: "text",
    width: 12,
    flex: 1.3,
    raw: (r) => r.ref_no ?? "",
    text: (r) => r.ref_no ?? "",
  },
  {
    header: "Year",
    kind: "number",
    width: 8,
    flex: 0.7,
    raw: (r) => num(r.year),
    text: (r) => String(num(r.year)),
  },
  {
    header: "Client",
    kind: "text",
    width: 26,
    flex: 2.4,
    raw: (r) => r.clients?.name ?? "",
    text: (r) => r.clients?.name ?? "",
  },
  {
    header: "B/L",
    kind: "text",
    width: 18,
    flex: 1.6,
    raw: (r) => r.bl_number ?? "",
    text: (r) => r.bl_number ?? "",
  },
  {
    header: "TANSAD",
    kind: "text",
    width: 16,
    flex: 1.4,
    raw: (r) => r.tansad_no ?? "",
    text: (r) => r.tansad_no ?? "",
  },

  {
    header: "Vessel",
    kind: "text",
    width: 20,
    flex: 1.8,
    raw: (r) => r.vessel_name ?? "",
    text: (r) => r.vessel_name ?? "",
  },
  {
    header: "Arrival",
    kind: "date",
    width: 12,
    flex: 1.1,
    raw: (r) => r.arrival_date ?? null,
    text: (r) => r.arrival_date ?? "",
  },
  {
    header: "Cargo",
    kind: "text",
    width: 12,
    flex: 1,
    raw: (r) =>
      [r.cargo_count != null ? String(r.cargo_count) : "", cargoLabel(r.cargo_type)]
        .filter(Boolean)
        .join(" × "),
    text: (r) =>
      [r.cargo_count != null ? String(r.cargo_count) : "", cargoLabel(r.cargo_type)]
        .filter(Boolean)
        .join(" × "),
  },
  {
    header: "Goods",
    kind: "text",
    width: 30,
    flex: 2.6,
    raw: (r) => r.goods_description ?? "",
    text: (r) => r.goods_description ?? "",
  },
  {
    header: "Pipeline Stage",
    kind: "text",
    width: 22,
    flex: 2,
    raw: (r) => currentStageLabel(r),
    text: (r) => currentStageLabel(r),
  },
  {
    header: "Amount",
    kind: "money",
    width: 16,
    flex: 1.6,
    raw: (r) => (r.amount != null ? num(r.amount) : null),
    text: (r) => (r.amount != null ? formatTzs(r.amount) : ""),
  },
  {
    header: "Release",
    kind: "text",
    width: 12,
    flex: 1.1,
    raw: (r) => r.release_status ?? "",
    text: (r) => r.release_status ?? "",
  },
  {
    header: "Released On",
    kind: "date",
    width: 12,
    flex: 1.1,
    raw: (r) => r.release_date ?? null,
    text: (r) => r.release_date ?? "",
  },
];

/** Index of the Amount column, so the XLSX TOTAL row can target it. */
export const AMOUNT_COLUMN_INDEX = EXPORT_COLUMNS.findIndex(
  (c) => c.header === "Amount",
);

export type ExportFilters = {
  year: number;
  client?: string;
  stage?: string;
  q?: string;
  sort: string;
  dir: string;
};

/** Human-readable filter banner used by both export formats. */
export function exportFilterSummary(
  filters: ExportFilters,
  clientName?: string,
): string {
  const parts = [`Year: ${filters.year}`];
  if (filters.client) parts.push(`Client: ${clientName ?? filters.client}`);
  if (filters.stage === "unreleased") parts.push("Status: Unreleased");
  if (filters.stage === "stuck") parts.push("Status: Stuck > 48h");
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  parts.push(`Sort: ${filters.sort} ${filters.dir}`);
  return parts.join(" · ");
}

/** ASCII-safe filename stem, e.g. `kdl-consignments-2026` (+ filter hints). */
export function exportFilenameStem(filters: ExportFilters): string {
  const bits = [`kdl-consignments-${filters.year}`];
  if (filters.stage === "unreleased") bits.push("unreleased");
  if (filters.stage === "stuck") bits.push("stuck");
  if (filters.client) bits.push("filtered");
  if (filters.q) bits.push("search");
  return bits.join("-");
}

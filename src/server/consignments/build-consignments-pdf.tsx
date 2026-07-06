/**
 * Pure PDF element builder for the consignments-list export (D-056). Mirrors
 * the reports PDF builder (`@/server/reports/build-pdf`): no file I/O — the
 * route handler calls `renderToBuffer` and ships the bytes.
 *
 * The list has 14 export columns (see `export-columns.ts`); A4 landscape can't
 * hold all of them legibly, so the PDF uses a trimmed, high-signal subset. The
 * XLSX export carries the full column set for anyone who needs everything.
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
  type DocumentProps,
} from "@react-pdf/renderer";
import { formatTzs, MASKED_AMOUNT } from "@/lib/money";
import { currentStageLabel } from "@/lib/pipeline";
import {
  exportFilterSummary,
  type ExportRow,
  type ExportFilters,
} from "./export-columns";

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
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    position: "absolute",
    top: 20,
    left: 24,
    right: 24,
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
  headerSubtitle: { fontSize: 7, color: "#6B7280", marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
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
    paddingVertical: 3,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  totalsRow: {
    flexDirection: "row",
    borderTop: 1,
    borderTopColor: "#9CA3AF",
    paddingTop: 4,
    paddingBottom: 4,
    fontWeight: 700,
  },
  cell: { paddingHorizontal: 3 },
  cellHead: { fontWeight: 700 },
  cellRight: { textAlign: "right" },
  emptyText: { fontStyle: "italic", color: "#6B7280", marginTop: 16 },
});

type PdfCol = {
  header: string;
  flex: number;
  align?: "left" | "right";
  value: (row: ExportRow) => string;
};

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Trimmed, legible subset for landscape A4. Amount masks to `•••` when the
// requesting role lacks "See financial amounts" (D-063).
function pdfColumns(canSeeAmount: boolean): PdfCol[] {
  return [
    { header: "Ref No", flex: 1.3, value: (r) => r.ref_no ?? "" },
    { header: "Client", flex: 2.6, value: (r) => r.clients?.name ?? "" },
    { header: "B/L", flex: 1.8, value: (r) => r.bl_number ?? "" },

    { header: "Vessel", flex: 1.8, value: (r) => r.vessel_name ?? "" },
    { header: "Arrival", flex: 1.1, value: (r) => r.arrival_date ?? "" },
    { header: "Pipeline Stage", flex: 2.2, value: (r) => currentStageLabel(r) },
    {
      header: "Amount",
      flex: 1.6,
      align: "right",
      value: (r) =>
        !canSeeAmount ? MASKED_AMOUNT : r.amount != null ? formatTzs(r.amount) : "",
    },
  ];
}

function PageFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header} fixed>
        {LOGO_BUFFER ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={LOGO_BUFFER} style={styles.logo} />
        ) : (
          <View style={styles.logo} />
        )}
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
      <View style={styles.footer} fixed>
        <Text>KDL Tracker</Text>
        <Text
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </Page>
  );
}

function HeaderRow({ columns }: { columns: PdfCol[] }) {
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

function DataRow({ row, columns }: { row: ExportRow; columns: PdfCol[] }) {
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

export function buildConsignmentsPdf(
  rows: ExportRow[],
  filters: ExportFilters,
  clientName?: string,
  canSeeAmount = true,
): React.ReactElement<DocumentProps> {
  const title = `Consignments · ${filters.year}`;
  const generated = `Generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
  const subtitle = `${generated} — ${exportFilterSummary(filters, clientName)}`;
  const columns = pdfColumns(canSeeAmount);
  const totalAmount = rows.reduce((s, r) => s + num(r.amount), 0);
  const flexes = columns.map((c) => c.flex);

  return (
    <Document title={title} author="KDL Tracker">
      <PageFrame title={title} subtitle={subtitle}>
        {rows.length === 0 ? (
          <Text style={styles.emptyText}>
            No consignments matched the filter.
          </Text>
        ) : (
          <View style={styles.table}>
            <HeaderRow columns={columns} />
            {rows.map((r, i) => (
              <DataRow key={i} row={r} columns={columns} />
            ))}
            <View style={styles.totalsRow} wrap={false}>
              {columns.map((c, i) => (
                <Text
                  key={i}
                  style={[
                    styles.cell,
                    { flex: flexes[i] ?? 1, fontWeight: 700 },
                    c.align === "right" ? styles.cellRight : {},
                  ]}
                >
                  {i === 0
                    ? "TOTAL"
                    : c.header === "Amount"
                      ? canSeeAmount
                        ? formatTzs(totalAmount)
                        : MASKED_AMOUNT
                      : ""}
                </Text>
              ))}
            </View>
          </View>
        )}
      </PageFrame>
    </Document>
  );
}

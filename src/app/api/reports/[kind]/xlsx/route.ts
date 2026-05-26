import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import {
  REPORT_OPTIONS,
  type ReportKind,
} from "@/app/(app)/reports/report-options";
import {
  fetchReportRows,
  reportFilenameStem,
  type ReportFilters,
} from "@/server/reports/fetch-report-rows";
import { buildReportWorkbook } from "@/server/reports/build-xlsx";

/**
 * GET /api/reports/<kind>/xlsx?year=…&from=…&to=…
 *
 * Downloads an Excel workbook for the given report. Mirrors `/reports`
 * (T-070) data exactly — both pages and exports share `fetchReportRows`.
 *
 * Auth: requires a signed-in user (any role; viewers can read the views via
 * RLS). 401 for unauth, 400 for bad kind/year, 500 for upstream errors.
 *
 * D-026: uses the user-bound server client. Admin-client allowlist stays
 * at 3 sites — none of them are here.
 */

export const dynamic = "force-dynamic";
// Render with Node so ExcelJS' streaming APIs work — Edge would also work but
// ExcelJS pulls in some Node-only built-ins via `fs`-style polyfills.
export const runtime = "nodejs";

const VALID_KINDS = new Set<ReportKind>(REPORT_OPTIONS.map((r) => r.value));

function isValidISODate(s: string | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind: rawKind } = await params;

  if (!VALID_KINDS.has(rawKind as ReportKind)) {
    return NextResponse.json(
      { error: `Unknown report kind: ${rawKind}` },
      { status: 400 },
    );
  }
  const kind = rawKind as ReportKind;

  // Auth gate — viewers + up may read (V-REPORTS).
  const perms = await getServerPermissions();
  if (!perms) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const yearRaw = url.searchParams.get("year");
  const currentYear = new Date().getFullYear();
  const year = yearRaw ? Number.parseInt(yearRaw, 10) || currentYear : currentYear;

  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const filters: ReportFilters = {
    year,
    from: isValidISODate(fromRaw) ? fromRaw : null,
    to: isValidISODate(toRaw) ? toRaw : null,
  };

  const supabase = await getSupabaseServerClient();
  const payload = await fetchReportRows(kind, filters, supabase);

  if (payload.error) {
    return NextResponse.json(
      { error: `Report query failed: ${payload.error}` },
      { status: 500 },
    );
  }

  const workbook = buildReportWorkbook(payload, filters);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  // exceljs returns an ArrayBuffer-like (sometimes the Node Buffer subclass).
  // Wrap in Uint8Array so the Response body is a stable BodyInit.
  const body = new Uint8Array(arrayBuffer as ArrayBuffer);

  const filename = `${reportFilenameStem(kind, filters)}.xlsx`;
  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

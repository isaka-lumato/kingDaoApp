import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import {
  parseListParams,
  resolvePrereqs,
  buildListQuery,
} from "@/server/consignments/list-query";
import {
  exportFilenameStem,
  type ExportRow,
  type ExportFilters,
} from "@/server/consignments/export-columns";
import { buildConsignmentsWorkbook } from "@/server/consignments/build-consignments-xlsx";
import { buildConsignmentsPdf } from "@/server/consignments/build-consignments-pdf";

/**
 * GET /api/consignments/export/<format>?year=&client=&stage=&q=&sort=&dir=
 *
 * Streams the consignments list as XLSX or PDF (D-056). Applies the exact same
 * filter/sort/search the `/consignments` grid uses (shared `list-query`
 * module), with NO pagination → every matching row is exported in the
 * on-screen order.
 *
 * Auth: signed-in user, any role (viewers+ may export — mirrors `/reports`).
 * D-026: user-bound server client; not the admin client.
 */

export const dynamic = "force-dynamic";
// Both ExcelJS and @react-pdf/renderer need Node built-ins — Edge won't work.
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ format: string }> },
) {
  const { format } = await params;
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json(
      { error: `Unknown export format: ${format}` },
      { status: 400 },
    );
  }

  const perms = await getServerPermissions();
  if (!perms) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const listParams = parseListParams({
    year: url.searchParams.get("year") ?? undefined,
    client: url.searchParams.get("client") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
  });

  const supabase = await getSupabaseServerClient();
  const prereqs = await resolvePrereqs(supabase, listParams);
  const { data, error } = (await buildListQuery(
    supabase,
    listParams,
    prereqs,
  )) as {
    data:
      | (Record<string, unknown> & {
          clients:
            | { id: string; name: string }
            | { id: string; name: string }[]
            | null;
        })[]
      | null;
    error: { message: string } | null;
  };

  if (error) {
    return NextResponse.json(
      { error: `Export query failed: ${error.message}` },
      { status: 500 },
    );
  }

  // Normalize the clients join (array → single object), same as the page.
  const rows = (data ?? []).map((row) => ({
    ...row,
    clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
  })) as unknown as ExportRow[];

  const filters: ExportFilters = {
    year: listParams.year,
    client: listParams.client,
    stage: listParams.stage,
    q: listParams.q,
    sort: listParams.sort,
    dir: listParams.dir,
  };
  const clientName = listParams.client
    ? rows.find((r) => r.clients)?.clients?.name
    : undefined;

  const stem = exportFilenameStem(filters);

  if (format === "xlsx") {
    const workbook = buildConsignmentsWorkbook(rows, filters, clientName);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const body = new Uint8Array(arrayBuffer as ArrayBuffer);
    return new Response(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${stem}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const element = buildConsignmentsPdf(rows, filters, clientName);
  const buffer = await renderToBuffer(element);
  const body = new Uint8Array(buffer);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${stem}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

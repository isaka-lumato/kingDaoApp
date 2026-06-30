import type { Metadata } from "next";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { perfTimer } from "@/lib/perf";
import {
  parseListParams,
  resolvePrereqs,
  buildListQuery,
} from "@/server/consignments/list-query";
import ConsignmentsClient from "./consignments-client";


export const metadata: Metadata = { title: "Consignments — KDL Tracker" };

export default async function ConsignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    client?: string;
    stage?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const listParams = parseListParams(params);
  const { year } = listParams;
  const page = params.page ? parseInt(params.page, 10) : 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;

  const t = perfTimer("consignments-list");
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  // Tier 1 (D-042): clients dropdown + the grid's prerequisite lookups
  // (stuck-stage ids when stage=stuck, client-name search ids when q is set)
  // all run in one parallel batch — none depend on each other.
  const [clientsRes, prereqs] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
    resolvePrereqs(supabase, listParams),
  ]);
  t.mark("tier1-clients+prereqs");

  // Tier 2: the main grid query, using the resolved ids. Paginated here; the
  // export route runs the same builder without `.range()`.
  type ConsignmentRow = Record<string, unknown> & {
    clients: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const mainRes = (await buildListQuery(supabase, listParams, prereqs).range(
    from,
    from + pageSize - 1,
  )) as {
    data: ConsignmentRow[] | null;
    count: number | null;
    error: { message: string } | null;
  };
  t.mark("tier2-consignments");

  const clients = clientsRes.data;
  const { data, count, error } = mainRes;

  // Supabase returns clients as an array from the join — normalize to single object
  const normalizedRows = (data ?? []).map((row) => ({
    ...row,
    clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
  }));


  t.end({ rows: (data ?? []).length, total: count ?? 0, stageFilter: listParams.stage ?? "none" });

  return (
    <ConsignmentsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows={normalizedRows as any}
      total={count ?? 0}
      page={page}
      pageSize={pageSize}
      year={year}
      clients={clients ?? []}
      filters={{
        client: listParams.client,
        stage: listParams.stage,
        q: listParams.q,
        sort: listParams.sort,
        dir: listParams.dir,
      }}
      fetchError={error?.message}
    />
  );
}

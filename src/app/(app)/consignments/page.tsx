import type { Metadata } from "next";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseListParams,
  LIST_PAGE_SIZE,
  type ListView,
} from "@/lib/consignments-list";
import { listConsignmentsAction } from "@/server/actions/consignments-list";
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
  const page = Math.max(1, params.page ? parseInt(params.page, 10) || 1 : 1);
  const view: ListView = { ...listParams, page };

  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();

  // Clients dropdown + the grid page run in parallel — neither depends on the
  // other (D-042). The grid query itself lives in `listConsignmentsAction` so
  // the client cache refetches through the exact same code path (D-065).
  const [clientsRes, initialPage] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
    listConsignmentsAction(view),
  ]);

  return (
    <ConsignmentsClient
      initialPage={initialPage}
      initialView={view}
      pageSize={LIST_PAGE_SIZE}
      clients={clientsRes.data ?? []}
    />
  );
}

import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import EfdListClient from "./efd-list-client";

export const metadata: Metadata = { title: "EFD Records — KDL Tracker" };

export default async function EfdPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    flag?: "private" | "transit" | "shared" | "standard";
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = params.page ? Math.max(1, parseInt(params.page, 10) || 1) : 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;

  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();
  const canWrite = !!perms && (perms.isAdmin || perms.roles.includes("operator"));

  let query = supabase
    .from("efd_records")
    .select(
      `id, efd_code, efd_time, is_private, is_transit, is_shared, notes, created_at,
       efd_record_consignments(consignment_id)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (params.q) query = query.ilike("efd_code", `%${params.q}%`);
  if (params.flag === "private") query = query.eq("is_private", true);
  else if (params.flag === "transit") query = query.eq("is_transit", true);
  else if (params.flag === "shared") query = query.eq("is_shared", true);
  else if (params.flag === "standard")
    query = query.eq("is_private", false).eq("is_transit", false);

  const { data, count, error } = await query;

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    efd_code: r.efd_code,
    efd_time: r.efd_time,
    is_private: r.is_private,
    is_transit: r.is_transit,
    is_shared: r.is_shared,
    notes: r.notes,
    created_at: r.created_at,
    link_count: Array.isArray(r.efd_record_consignments)
      ? r.efd_record_consignments.length
      : 0,
  }));

  return (
    <EfdListClient
      rows={rows}
      total={count ?? 0}
      page={page}
      pageSize={pageSize}
      filters={{ q: params.q, flag: params.flag }}
      canWrite={canWrite}
      fetchError={error?.message}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import NewEfdForm from "./new-efd-form";

export const metadata: Metadata = { title: "New EFD Record — KDL Tracker" };

export default async function NewEfdPage({
  searchParams,
}: {
  searchParams: Promise<{ from_batch?: string; client?: string; year?: string }>;
}) {
  const perms = await getServerPermissions();
  if (!perms) redirect("/login");
  if (!perms.isAdmin && !perms.roles.includes("operator")) {
    redirect("/efd");
  }

  const supabase = await getSupabaseServerClient();
  const currentYear = new Date().getFullYear();
  const sp = await searchParams;

  // Fetch recent / unreleased consignments for the link picker. Limit to a
  // reasonable window so the page stays fast — operators searching for older
  // jobs can use the consignment table to find an id (rare path).
  const { data: consignments } = await supabase
    .from("consignments")
    .select("id, ref_no, year, bl_number, release_status, clients(name)")
    .is("deleted_at", null)
    .gte("year", currentYear - 1)
    .order("year", { ascending: false })
    .order("serial_no", { ascending: false })
    .limit(500);

  const candidates = (consignments ?? []).map((c) => ({
    id: c.id,
    ref_no: c.ref_no,
    year: c.year,
    bl_number: c.bl_number,
    release_status: c.release_status,
    client_name: Array.isArray(c.clients)
      ? c.clients[0]?.name ?? null
      : (c.clients as { name: string } | null)?.name ?? null,
  }));

  // Pre-select all siblings of a batch when deep-linked from the batch panel CTA.
  let preselectedIds: string[] = [];
  const fromBatch = sp.from_batch?.trim();
  const clientId = sp.client?.trim();
  const yearParam = sp.year ? parseInt(sp.year, 10) : NaN;
  if (fromBatch && clientId && Number.isFinite(yearParam)) {
    const { data: siblings } = await supabase
      .from("consignments")
      .select("id")
      .eq("in_ref", fromBatch)
      .eq("client_id", clientId)
      .eq("year", yearParam)
      .is("deleted_at", null);
    preselectedIds = (siblings ?? []).map((s) => s.id);
  }

  return <NewEfdForm candidates={candidates} preselectedIds={preselectedIds} />;
}

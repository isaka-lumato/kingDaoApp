import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import NewEfdForm from "./new-efd-form";

export const metadata: Metadata = { title: "New EFD Record — KDL Tracker" };

export default async function NewEfdPage() {
  const perms = await getServerPermissions();
  if (!perms) redirect("/login");
  if (!perms.isAdmin && !perms.roles.includes("operator")) {
    redirect("/efd");
  }

  const supabase = await getSupabaseServerClient();
  const currentYear = new Date().getFullYear();

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

  return <NewEfdForm candidates={candidates} preselectedIds={[]} />;
}

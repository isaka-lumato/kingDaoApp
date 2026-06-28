import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import ClientsTable, { type ClientTableRow } from "./clients-table";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2020 && parsedYear <= 2099
      ? parsedYear
      : new Date().getFullYear();

  const supabase = await getSupabaseServerClient();

  // Revenue is admin-gated; resolve before any amount is summed/shipped.
  const perms = await getServerPermissions();
  const isAdmin = perms?.isAdmin ?? false;

  const [clientsRes, volumeRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, company, display_name, contact_email, phone, notes, is_active")
      .is("deleted_at", null)
      .order("name")
      .order("display_name", { nullsFirst: true }),
    supabase
      .from("v_client_volume")
      .select("client_id, job_count, total_containers, total_revenue")
      .eq("year", year),
  ]);

  // Index the per-year aggregates by client so the join is a cheap lookup.
  const volumeByClient = new Map<
    string,
    { jobCount: number; totalContainers: number; totalRevenue: number }
  >();
  for (const v of volumeRes.data ?? []) {
    if (!v.client_id) continue;
    volumeByClient.set(v.client_id, {
      jobCount: Number(v.job_count ?? 0),
      totalContainers: Number(v.total_containers ?? 0),
      totalRevenue: Number(v.total_revenue ?? 0),
    });
  }

  const rows: ClientTableRow[] = (clientsRes.data ?? []).map((c) => {
    const vol = volumeByClient.get(c.id);
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      display_name: c.display_name,
      contact_email: c.contact_email,
      phone: c.phone,
      notes: c.notes,
      is_active: c.is_active,
      jobCount: vol?.jobCount ?? 0,
      totalContainers: vol?.totalContainers ?? 0,
      // Never ship revenue to non-admins.
      totalRevenue: isAdmin ? (vol?.totalRevenue ?? 0) : null,
    };
  });

  return (
    <div className="space-y-6">
      {clientsRes.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {clientsRes.error.message}
        </div>
      )}
      <ClientsTable clients={rows} year={year} />
    </div>
  );
}

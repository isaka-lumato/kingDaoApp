import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import VesselsTable, { type VesselTableRow } from "./vessels-table";

export const metadata: Metadata = { title: "Vessels" };

export default async function VesselsPage() {
  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();
  const isAdmin = perms?.isAdmin ?? false;

  // Vessels reference consignments by free-text name (D-050), not an FK, so
  // usage is tallied by matching consignment.vessel_name to vessels.name.
  const [vesselsRes, usageRes] = await Promise.all([
    supabase
      .from("vessels")
      .select("id, name, is_active")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("consignments")
      .select("vessel_name")
      .is("deleted_at", null)
      .not("vessel_name", "is", null),
  ]);

  const usageByName = new Map<string, number>();
  for (const c of usageRes.data ?? []) {
    const name = c.vessel_name?.trim();
    if (!name) continue;
    usageByName.set(name, (usageByName.get(name) ?? 0) + 1);
  }

  const rows: VesselTableRow[] = (vesselsRes.data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    is_active: v.is_active,
    consignmentCount: usageByName.get(v.name.trim()) ?? 0,
  }));

  return (
    <div className="space-y-6">
      {vesselsRes.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {vesselsRes.error.message}
        </div>
      )}
      <VesselsTable vessels={rows} isAdmin={isAdmin} />
    </div>
  );
}

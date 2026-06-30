import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import IcdsTable, { type IcdTableRow } from "./icds-table";

export const metadata: Metadata = { title: "ICDs" };

export default async function IcdsPage() {
  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();
  const isAdmin = perms?.isAdmin ?? false;

  const [icdsRes, usageRes] = await Promise.all([
    supabase
      .from("icds")
      .select("id, name, location, is_active")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("consignments")
      .select("icd_id")
      .is("deleted_at", null)
      .not("icd_id", "is", null),
  ]);

  // Tally consignments per ICD client-side — cheap at this scale (~hundreds/yr).
  const usageByIcd = new Map<string, number>();
  for (const c of usageRes.data ?? []) {
    if (!c.icd_id) continue;
    usageByIcd.set(c.icd_id, (usageByIcd.get(c.icd_id) ?? 0) + 1);
  }

  const rows: IcdTableRow[] = (icdsRes.data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    location: i.location,
    is_active: i.is_active,
    consignmentCount: usageByIcd.get(i.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      {icdsRes.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {icdsRes.error.message}
        </div>
      )}
      <IcdsTable icds={rows} isAdmin={isAdmin} />
    </div>
  );
}

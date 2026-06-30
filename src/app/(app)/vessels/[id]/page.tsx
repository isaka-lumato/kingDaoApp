import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveStage } from "@/lib/pipeline";
import VesselDetail, {
  type VesselConsignmentRow,
  type SelectedVessel,
} from "../vessel-detail";

export const metadata: Metadata = { title: "Vessel" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VesselDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await getSupabaseServerClient();

  const { data: vessel, error: vesselErr } = await supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (vesselErr || !vessel) notFound();

  // Consignments reference a vessel by free-text name (D-050), so match on name.
  const { data: consignmentsData } = await supabase
    .from("consignments")
    .select(
      `id, ref_no, year, serial_no, arrival_date,
       cargo_count, release_status, release_date,
       clients(name, display_name),
       manifest_status, shipping_batch_status, tanesws_status,
       assessment_status, tbs_loading_status, tbs_debit_status,
       manifest_comp_status, duty_status, inspection_file_status`,
    )
    .eq("vessel_name", vessel.name)
    .is("deleted_at", null)
    .order("year", { ascending: false })
    .order("serial_no", { ascending: true });

  const raw = (consignmentsData ?? []) as unknown as Array<
    VesselConsignmentRow & {
      clients?: { name: string; display_name: string | null } | null;
    }
  >;

  const completed: VesselConsignmentRow[] = [];
  const active: VesselConsignmentRow[] = [];
  let totalContainers = 0;

  for (const row of raw) {
    totalContainers += row.cargo_count ?? 0;
    const client = row.clients;
    row.client_label = client
      ? client.display_name?.trim() || client.name
      : "—";
    if (row.release_status === "Released") {
      completed.push(row);
    } else {
      row.active_stage = resolveActiveStage(
        row as unknown as Record<string, string>,
      );
      active.push(row);
    }
  }

  const detail: SelectedVessel = {
    id: vessel.id,
    name: vessel.name,
    isActive: vessel.is_active,
    totalContainers,
    totalCount: raw.length,
    activeCount: active.length,
    completedCount: completed.length,
    active,
    completed,
  };

  return (
    <div className="space-y-6">
      <Link
        href="/vessels"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All vessels
      </Link>
      <VesselDetail vessel={detail} />
    </div>
  );
}

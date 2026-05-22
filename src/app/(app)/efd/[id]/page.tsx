import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import EditEfdForm from "./edit-efd-form";

export const metadata: Metadata = { title: "EFD Record — KDL Tracker" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EfdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const perms = await getServerPermissions();
  const supabase = await getSupabaseServerClient();

  const { data: efd, error } = await supabase
    .from("efd_records")
    .select("id, efd_code, efd_time, is_private, is_transit, is_shared, notes, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !efd) notFound();

  // Linked consignments.
  const { data: links } = await supabase
    .from("efd_record_consignments")
    .select(
      `consignment_id, linked_at,
       consignments(id, ref_no, year, bl_number, release_status, clients(name))`
    )
    .eq("efd_record_id", id);

  const linkedConsignments = (links ?? [])
    .map((l) => {
      const raw = l.consignments as unknown;
      const c = Array.isArray(raw)
        ? (raw[0] as Record<string, unknown> | undefined)
        : (raw as Record<string, unknown> | null);
      if (!c) return null;
      const clientsRaw = c.clients as unknown;
      const client = Array.isArray(clientsRaw)
        ? (clientsRaw[0] as { name: string } | undefined)
        : (clientsRaw as { name: string } | null);
      return {
        id: c.id as string,
        ref_no: c.ref_no as string,
        year: c.year as number,
        bl_number: (c.bl_number as string | null) ?? null,
        release_status: c.release_status as string,
        client_name: client?.name ?? null,
        linked_at: l.linked_at as string,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Candidate consignments (recent / unreleased + already-linked) for the
  // add-link picker. Exclude ones that are already linked.
  const currentYear = new Date().getFullYear();
  const { data: candidatesRaw } = await supabase
    .from("consignments")
    .select("id, ref_no, year, bl_number, release_status, clients(name)")
    .is("deleted_at", null)
    .gte("year", currentYear - 1)
    .order("year", { ascending: false })
    .order("serial_no", { ascending: false })
    .limit(500);

  const linkedIds = new Set(linkedConsignments.map((c) => c.id));
  const candidates = (candidatesRaw ?? [])
    .filter((c) => !linkedIds.has(c.id))
    .map((c) => ({
      id: c.id,
      ref_no: c.ref_no,
      year: c.year,
      bl_number: c.bl_number,
      release_status: c.release_status,
      client_name: Array.isArray(c.clients)
        ? c.clients[0]?.name ?? null
        : (c.clients as { name: string } | null)?.name ?? null,
    }));

  const canWrite = !!perms && (perms.isAdmin || perms.roles.includes("operator"));
  const isAdmin = !!perms?.isAdmin;

  return (
    <EditEfdForm
      efd={efd}
      linkedConsignments={linkedConsignments}
      candidates={candidates}
      canWrite={canWrite}
      isAdmin={isAdmin}
    />
  );
}

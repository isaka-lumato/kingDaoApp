import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { resolveActiveStage } from "@/lib/pipeline";
import ClientDetail, {
  type ClientConsignmentRow,
  type SelectedClient,
} from "../client-detail";

export const metadata: Metadata = { title: "Client" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sp = await searchParams;
  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2020 && parsedYear <= 2099
      ? parsedYear
      : new Date().getFullYear();

  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();
  const canSeeAmount = perms?.canRead("consignments", "amount") ?? false;

  const detail = await fetchClientDetail(supabase, id, year, canSeeAmount);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All clients
      </Link>
      <ClientDetail client={detail} />
    </div>
  );
}

type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

async function fetchClientDetail(
  supabase: ServerClient,
  id: string,
  year: number,
  canSeeAmount: boolean,
): Promise<SelectedClient | null> {
  const [clientRes, consignmentsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, company, display_name, contact_email, phone, notes")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("consignments")
      .select(
        `id, ref_no, year, serial_no, vessel_name, arrival_date,
         cargo_count, amount, release_status, release_date,
         manifest_status, shipping_batch_status, tanesws_status,
         assessment_status, tbs_loading_status, tbs_debit_status,
         manifest_comp_status, duty_status, inspection_file_status`,
      )
      .eq("client_id", id)
      .eq("year", year)
      .is("deleted_at", null)
      .order("serial_no", { ascending: true }),
  ]);

  if (clientRes.error || !clientRes.data) return null;

  const rows = (consignmentsRes.data ?? []) as ClientConsignmentRow[];

  // Split active vs completed. "Completed" = release_status Released; everything
  // else is active (matching the consignments list semantics, not v_client_volume).
  const completed: ClientConsignmentRow[] = [];
  const active: ClientConsignmentRow[] = [];
  for (const row of rows) {
    if (row.release_status === "Released") completed.push(row);
    else {
      row.active_stage = resolveActiveStage(
        row as unknown as Record<string, string>,
      );
      active.push(row);
    }
  }

  const totalContainers = rows.reduce(
    (sum, r) => sum + (r.cargo_count ?? 0),
    0,
  );

  const clearanceDays = completed
    .filter((r) => r.arrival_date && r.release_date)
    .map((r) =>
      differenceInCalendarDays(
        parseISO(r.release_date as string),
        parseISO(r.arrival_date as string),
      ),
    )
    .filter((d) => d >= 0);
  const avgClearanceDays =
    clearanceDays.length > 0
      ? Math.round(
          (clearanceDays.reduce((s, d) => s + d, 0) / clearanceDays.length) * 10,
        ) / 10
      : null;

  return {
    id: clientRes.data.id,
    name: clientRes.data.name,
    company: clientRes.data.company,
    displayName: clientRes.data.display_name,
    contactEmail: clientRes.data.contact_email,
    phone: clientRes.data.phone,
    notes: clientRes.data.notes,
    year,
    canSeeAmount,
    totalContainers,
    activeCount: active.length,
    completedCount: completed.length,
    avgClearanceDays,
    // Only computed and shipped to roles with "See financial amounts".
    totalRevenue: canSeeAmount
      ? rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
      : null,
    active,
    completed,
  };
}

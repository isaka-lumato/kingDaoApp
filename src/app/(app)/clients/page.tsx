import type { Metadata } from "next";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { resolveActiveStage } from "@/lib/pipeline";
import ClientsListPanel, { type ClientListRow } from "./clients-list-panel";
import ClientDetail, {
  type ClientConsignmentRow,
  type SelectedClient,
} from "./client-detail";

export const metadata: Metadata = { title: "Clients" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Single-route master-detail. The selected client is driven by the `?c=<id>`
 * query param rather than a `/clients/[id]` segment — selecting a client
 * updates the query (scroll:false) without changing the route segment, so the
 * list panel stays mounted and never re-suspends/flickers. (Same rationale as
 * the consignments batch panel, which navigates via `?batch=`.)
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const selectedId = sp.c && UUID_RE.test(sp.c) ? sp.c : null;

  const parsedYear = Number(sp.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2020 && parsedYear <= 2099
      ? parsedYear
      : new Date().getFullYear();

  const supabase = await getSupabaseServerClient();

  // Always fetch the list. Fetch the selected client's detail only when one is
  // chosen — revenue gating is resolved before the amount is ever summed.
  const perms = selectedId ? await getServerPermissions() : null;
  const isAdmin = perms?.isAdmin ?? false;

  const [clientsRes, detail] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, sub_label, contact_email, notes, is_active")
      .is("deleted_at", null)
      .order("name")
      .order("sub_label", { nullsFirst: true }),
    selectedId ? fetchClientDetail(supabase, selectedId, year, isAdmin) : null,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Clients</h2>
        <p className="text-muted-foreground text-sm">
          Browse a client and all their consignments — active jobs and released history.
        </p>
      </div>

      {clientsRes.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {clientsRes.error.message}
        </div>
      )}

      <div className="flex gap-6">
        <ClientsListPanel clients={(clientsRes.data ?? []) as ClientListRow[]} />
        <div className="flex-1 min-w-0">
          {detail ? (
            <ClientDetail client={detail} />
          ) : (
            <div className="rounded-xl border border-border border-dashed flex items-center justify-center text-muted-foreground text-sm min-h-[40vh]">
              {selectedId
                ? "Client not found."
                : "Select a client to view their consignments"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

async function fetchClientDetail(
  supabase: ServerClient,
  id: string,
  year: number,
  isAdmin: boolean,
): Promise<SelectedClient | null> {
  const [clientRes, consignmentsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, sub_label, contact_email, notes")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("consignments")
      .select(
        `id, ref_no, year, serial_no, vessel_name, arrival_date,
         container_count, amount, release_status, release_date,
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
    (sum, r) => sum + (r.container_count ?? 0),
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
    subLabel: clientRes.data.sub_label,
    contactEmail: clientRes.data.contact_email,
    notes: clientRes.data.notes,
    year,
    isAdmin,
    totalContainers,
    activeCount: active.length,
    completedCount: completed.length,
    avgClearanceDays,
    // Only computed and shipped for admins.
    totalRevenue: isAdmin
      ? rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
      : null,
    active,
    completed,
  };
}

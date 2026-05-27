import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { formatTzs } from "@/lib/money";

type Props = {
  inRef: string;
  clientId: string;
  year: number;
};

function isWriter(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("operator");
}

function currentStageLabel(c: {
  manifest_status: string;
  shipping_batch_status: string;
  tanesws_status: string;
  assessment_status: string;
  tbs_loading_status: string;
  tbs_debit_status: string;
  manifest_comp_status: string;
  duty_status: string;
  inspection_file_status: string;
  release_status: string;
}): string {
  const stages = [
    { label: "Manifest", status: c.manifest_status },
    { label: "Shipping", status: c.shipping_batch_status },
    { label: "TANESWS", status: c.tanesws_status },
    { label: "Assessment", status: c.assessment_status },
    { label: "TBS Loading", status: c.tbs_loading_status },
    { label: "TBS Debit", status: c.tbs_debit_status },
    { label: "Mfst Comp", status: c.manifest_comp_status },
    { label: "Duty", status: c.duty_status },
    { label: "Inspection", status: c.inspection_file_status },
    { label: "Release", status: c.release_status },
  ];
  const active = stages.find((s) => s.status !== "Done");
  return active ? `${active.label} — ${active.status}` : "Released";
}

export default async function BatchPanelContent({ inRef, clientId, year }: Props) {
  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();

  const [summaryRes, siblingsRes] = await Promise.all([
    supabase
      .from("v_in_ref_batches")
      .select(
        "in_ref, client_id, year, client_name, consignment_count, total_containers, total_amount, all_released, earliest_arrival, latest_arrival, efd_code"
      )
      .eq("in_ref", inRef)
      .eq("client_id", clientId)
      .eq("year", year)
      .maybeSingle(),
    supabase
      .from("consignments")
      .select(
        `id, ref_no, year, bl_number, container_count, container_type,
         amount, release_status,
         manifest_status, shipping_batch_status, tanesws_status,
         assessment_status, tbs_loading_status, tbs_debit_status,
         manifest_comp_status, duty_status, inspection_file_status`
      )
      .eq("in_ref", inRef)
      .eq("client_id", clientId)
      .eq("year", year)
      .is("deleted_at", null)
      .order("serial_no", { ascending: true }),
  ]);

  const summary = summaryRes.data;
  const siblings = siblingsRes.data ?? [];

  if (!summary && siblings.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No batch found for <span className="font-mono">{inRef}</span>.
      </div>
    );
  }

  const releasedCount = siblings.filter((c) => c.release_status === "Released").length;
  const canCreateEfd = Boolean(perms && isWriter(perms.roles)) && !summary?.efd_code;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">
          {summary?.client_name ?? "—"}{" "}
          <span className="text-muted-foreground">· {year}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Consignments
          </div>
          <div className="font-mono text-lg font-bold text-foreground">
            {summary?.consignment_count ?? siblings.length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Containers
          </div>
          <div className="font-mono text-lg font-bold text-foreground">
            {summary?.total_containers ?? "—"}
          </div>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total amount
          </div>
          <div className="font-mono text-lg font-bold text-foreground">
            {summary?.total_amount != null ? formatTzs(summary.total_amount) : "—"}
          </div>
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="font-medium text-foreground">
            {releasedCount} of {siblings.length} released
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">EFD</span>
          {summary?.efd_code ? (
            <span className="font-mono font-semibold text-foreground">
              {summary.efd_code}
            </span>
          ) : (
            <span className="text-muted-foreground italic">not issued</span>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Consignments in batch
        </h3>
        <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
          {siblings.map((c) => (
            <Link
              key={c.id}
              href={`/consignments/${c.id}`}
              className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
            >
              <span className="font-mono font-bold text-foreground">{c.ref_no}</span>
              <span className="text-muted-foreground">
                {c.container_count ?? "?"}×{c.container_type ?? "?"}
              </span>
              <span className="ml-auto text-muted-foreground font-mono">
                {c.amount != null ? formatTzs(c.amount) : "—"}
              </span>
              <span
                className={[
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                  c.release_status === "Released"
                    ? "bg-stage-done/15 text-stage-done border-stage-done/30"
                    : "bg-stage-waiting/15 text-stage-waiting border-stage-waiting/30",
                ].join(" ")}
              >
                {currentStageLabel(c)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {canCreateEfd && (
        <div className="border-t border-border pt-4">
          <Link
            href={`/efd/new?from_batch=${encodeURIComponent(inRef)}&client=${clientId}&year=${year}`}
            className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Create EFD for this batch
          </Link>
        </div>
      )}
    </div>
  );
}

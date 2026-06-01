import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { PIPELINE_STAGES, type StageField } from "@/lib/pipeline";
import Link from "next/link";

export const metadata: Metadata = { title: "Action Inbox — KDL Tracker" };

type InboxItem = {
  id: string;
  ref_no: string;
  year: number;
  client_name: string;
  goods_description: string | null;
  vessel_name: string | null;
  stage_label: string;
  stage_field: StageField;
  stage_status: string;
  updated_at: string;
};

export default async function InboxPage() {
  // Per T-048 / D-026: user-bound server client; RLS enforced.
  const supabase = await getSupabaseServerClient();
  const perms = await getServerPermissions();

  // Determine which stage fields this user can write.
  const writableFields = PIPELINE_STAGES.filter((s) => {
    if (!perms) return false;
    return perms.canWrite("consignments", s.field);
  }).map((s) => s.field);

  // Fetch consignments where any writable stage is in "Action" state.
  const { data, error } = await supabase
    .from("consignments")
    .select(
      `id, ref_no, year, goods_description, vessel_name, updated_at,
       manifest_status, shipping_batch_status, tanesws_status,
       assessment_status, tbs_loading_status, tbs_debit_status,
       manifest_comp_status, duty_status, inspection_file_status, release_status,
       clients(name)`
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: true }) // oldest first — most urgent
    .limit(200);

  // Build inbox items — one entry per actionable stage per consignment.
  const items: InboxItem[] = [];

  for (const row of data ?? []) {
    const client = row.clients as unknown as { name: string } | null;

    for (const stage of PIPELINE_STAGES) {
      if (!writableFields.includes(stage.field)) continue;
      const status = row[stage.field as keyof typeof row] as string;
      if (status !== "Action") continue;

      items.push({
        id: row.id,
        ref_no: row.ref_no,
        year: row.year,
        client_name: client?.name ?? "—",
        goods_description: row.goods_description,
        vessel_name: row.vessel_name,
        stage_label: stage.label,
        stage_field: stage.field,
        stage_status: status,
        updated_at: row.updated_at,
      });
    }
  }

  // Group by stage_label.
  const grouped = new Map<string, InboxItem[]>();
  for (const item of items) {
    const list = grouped.get(item.stage_label) ?? [];
    list.push(item);
    grouped.set(item.stage_label, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Action Inbox</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {items.length} item{items.length !== 1 ? "s" : ""} requiring your attention
          {writableFields.length === 0 && " — no writable stages assigned to your role"}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load inbox: {error.message}
        </div>
      )}

      {items.length === 0 && !error && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-foreground font-semibold">All clear</p>
          <p className="text-muted-foreground text-sm mt-1">
            No consignments are waiting for your action right now.
          </p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([stageLabel, stageItems]) => (
        <section key={stageLabel}>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">{stageLabel}</h2>
            <span className="text-xs bg-stage-action/15 text-stage-action border border-stage-action/30 rounded-full px-2 py-0.5 font-medium">
              {stageItems.length}
            </span>
            <div className="flex-1 border-t border-border min-w-[2rem]" />
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ref No</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Goods</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Vessel</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Updated</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stageItems.map((item) => (
                  <tr key={`${item.id}-${item.stage_field}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/consignments/${item.id}`}
                        className="font-mono font-bold text-foreground hover:text-brand transition-colors text-xs"
                      >
                        {item.ref_no}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{item.year}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground/80 font-medium text-xs">
                      {item.client_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">
                      {item.goods_description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                      {item.vessel_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(item.updated_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/consignments/${item.id}`}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul className="md:hidden flex flex-col gap-2">
            {stageItems.map((item) => (
              <li key={`${item.id}-${item.stage_field}`}>
                <Link
                  href={`/consignments/${item.id}`}
                  className="block rounded-xl border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {item.ref_no}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                      {item.year}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-foreground/90 mt-1 truncate">
                    {item.client_name}
                  </p>
                  {item.goods_description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {item.goods_description}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-muted-foreground">
                    <span className="truncate">
                      {item.vessel_name ? `⚓ ${item.vessel_name}` : ""}
                    </span>
                    <span className="shrink-0">
                      {new Date(item.updated_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

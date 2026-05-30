import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatTzs } from "@/lib/money";

type LinkedEfd = {
  id: string;
  efd_code: string;
  efd_time: string | null;
  is_private: boolean;
  is_transit: boolean;
  is_shared: boolean;
  created_at: string;
};

type AuditEntry = {
  id: string;
  occurred_at: string;
  actor_email: string | null;
  column_name: string | null;
  old_value: unknown;
  new_value: unknown;
};

type GutaPair = {
  batchCode: string;
  thisRole: "PARTS" | "FRAMES";
  sibling: {
    id: string;
    ref_no: string;
    bl_number: string | null;
    container_count: number | null;
    container_type: string | null;
    amount: number | null;
    release_status: string;
    release_date: string | null;
    goods_description: string | null;
  };
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground font-medium">
        {value ?? <span className="text-muted-foreground/50 font-normal">-</span>}
      </p>
    </div>
  );
}

function renderAuditValue(v: unknown, maxLen = 60): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") {
    return v.length > maxLen ? `${v.slice(0, maxLen)}...` : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
  } catch {
    return "[unrenderable]";
  }
}

function renderColumnLabel(col: string | null): string {
  if (!col) return "-";
  if (col === "_inserted") return "Row created";
  if (col === "_deleted") return "Row deleted";
  if (col === "FORCED_STAGE_CHANGE") return "Forced stage change";
  return col;
}

async function fetchLinkedEfds(consignmentId: string): Promise<LinkedEfd[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("efd_record_consignments")
    .select(
      `efd_record_id,
       efd_records(id, efd_code, efd_time, is_private, is_transit, is_shared, created_at)`
    )
    .eq("consignment_id", consignmentId);

  return (data ?? [])
    .map((l) => {
      const raw = l.efd_records as unknown;
      const e = Array.isArray(raw)
        ? (raw[0] as Record<string, unknown> | undefined)
        : (raw as Record<string, unknown> | null);
      if (!e) return null;
      return {
        id: e.id as string,
        efd_code: e.efd_code as string,
        efd_time: (e.efd_time as string | null) ?? null,
        is_private: Boolean(e.is_private),
        is_transit: Boolean(e.is_transit),
        is_shared: Boolean(e.is_shared),
        created_at: e.created_at as string,
      };
    })
    .filter((x): x is LinkedEfd => x !== null);
}

async function fetchGutaPair(
  consignmentId: string,
  gutaPairId: string | null,
): Promise<GutaPair | null> {
  if (!gutaPairId) return null;

  const supabase = await getSupabaseServerClient();
  const { data: pair } = await supabase
    .from("guta_pairs")
    .select("id, batch_code, parts_consignment_id, frames_consignment_id")
    .eq("id", gutaPairId)
    .single();

  if (!pair) return null;

  const thisIsParts = pair.parts_consignment_id === consignmentId;
  const siblingId = thisIsParts
    ? pair.frames_consignment_id
    : pair.parts_consignment_id;

  const { data: sibling } = await supabase
    .from("consignments")
    .select(
      "id, ref_no, bl_number, container_count, container_type, amount, release_status, release_date, goods_description"
    )
    .eq("id", siblingId)
    .is("deleted_at", null)
    .single();

  if (!sibling) return null;

  return {
    batchCode: pair.batch_code,
    thisRole: thisIsParts ? "PARTS" : "FRAMES",
    sibling,
  };
}

function GutaPairSection({
  gutaPair,
  isReleased,
  releaseStatus,
}: {
  gutaPair: GutaPair;
  isReleased: boolean;
  releaseStatus: string;
}) {
  const siblingReleased = gutaPair.sibling.release_status === "Released";
  const oneReleased = isReleased !== siblingReleased;
  const siblingRole = gutaPair.thisRole === "PARTS" ? "FRAMES" : "PARTS";

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          GUTA pair
        </h2>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-600 border-indigo-500/30 font-mono">
          {gutaPair.batchCode} - this is {gutaPair.thisRole}
        </span>
      </div>

      {oneReleased && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <span aria-hidden className="text-base leading-none">!</span>
          <span>
            <strong className="font-semibold">Paired consignment not yet released.</strong>{" "}
            {isReleased
              ? `This ${gutaPair.thisRole} record is released but ${siblingRole} (${gutaPair.sibling.ref_no}) is still ${gutaPair.sibling.release_status}.`
              : `${siblingRole} (${gutaPair.sibling.ref_no}) is already released but this ${gutaPair.thisRole} record is still ${releaseStatus}.`}
          </span>
        </div>
      )}

      <Link
        href={`/consignments/${gutaPair.sibling.id}`}
        className="block rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
              Paired with ({siblingRole})
            </p>
            <p className="font-mono font-bold text-foreground">
              {gutaPair.sibling.ref_no}
            </p>
            {gutaPair.sibling.goods_description && (
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                {gutaPair.sibling.goods_description}
              </p>
            )}
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-muted/60 text-muted-foreground border border-border">
            {gutaPair.sibling.release_status}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="B/L" value={gutaPair.sibling.bl_number} />
          <Field
            label="Container"
            value={
              gutaPair.sibling.container_count
                ? `${gutaPair.sibling.container_count} x ${gutaPair.sibling.container_type ?? "?"}`
                : null
            }
          />
          <Field
            label="Amount"
            value={
              gutaPair.sibling.amount != null
                ? formatTzs(gutaPair.sibling.amount)
                : null
            }
          />
          <Field
            label="Release date"
            value={
              gutaPair.sibling.release_date
                ? new Date(gutaPair.sibling.release_date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : null
            }
          />
        </div>
      </Link>
    </section>
  );
}

function LinkedEfdsSection({ linkedEfds }: { linkedEfds: LinkedEfd[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Linked EFD records
        </h2>
        <Link href="/efd/new" className="text-xs text-brand hover:underline">
          + New EFD
        </Link>
      </div>
      {linkedEfds.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No EFD records linked yet.
        </p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {linkedEfds.map((e) => (
            <Link
              key={e.id}
              href={`/efd/${e.id}`}
              className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
            >
              <span className="font-mono font-bold text-xs text-brand">
                {e.efd_code}
              </span>
              {e.efd_time && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {e.efd_time}
                </span>
              )}
              <div className="flex flex-wrap gap-1 flex-1">
                {e.is_private && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-violet-500/15 text-violet-600 border-violet-500/30">
                    PRIVATE
                  </span>
                )}
                {e.is_transit && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-600 border-sky-500/30">
                    TRANSIT
                  </span>
                )}
                {e.is_shared && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-600 border-amber-500/30">
                    SHARED
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(e.created_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export async function OverviewSecondary({
  consignmentId,
  gutaPairId,
  isReleased,
  releaseStatus,
}: {
  consignmentId: string;
  gutaPairId: string | null;
  isReleased: boolean;
  releaseStatus: string;
}) {
  const [gutaPair, linkedEfds] = await Promise.all([
    fetchGutaPair(consignmentId, gutaPairId),
    fetchLinkedEfds(consignmentId),
  ]);

  return (
    <>
      {gutaPair && (
        <GutaPairSection
          gutaPair={gutaPair}
          isReleased={isReleased}
          releaseStatus={releaseStatus}
        />
      )}
      <LinkedEfdsSection linkedEfds={linkedEfds} />
    </>
  );
}

export function OverviewSecondaryLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="h-3 w-28 rounded bg-muted/60" />
        <div className="mt-4 h-20 rounded-lg border border-border bg-muted/20" />
      </section>
    </div>
  );
}

export async function AuditPanel({ consignmentId }: { consignmentId: string }) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor_email, column_name, old_value, new_value")
    .eq("row_id", consignmentId)
    .eq("table_name", "consignments")
    .order("occurred_at", { ascending: false })
    .limit(50);

  const auditLog = (data ?? []) as AuditEntry[];

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {auditLog.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground text-sm">
          No audit history yet.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">When</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">By</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Field</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Old</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">New</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {auditLog.map((entry) => {
              const isSentinel =
                entry.column_name === "_inserted" ||
                entry.column_name === "_deleted" ||
                entry.column_name === "FORCED_STAGE_CHANGE";
              return (
                <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.occurred_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate">
                    {entry.actor_email ?? "system"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-foreground">
                    {renderColumnLabel(entry.column_name)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground break-all">
                    {isSentinel ? "-" : renderAuditValue(entry.old_value)}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground break-all">
                    {isSentinel ? "-" : renderAuditValue(entry.new_value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AuditPanelLoading() {
  return (
    <div className="rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="grid grid-cols-5 gap-4 border-b border-border bg-muted/30 px-4 py-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-3 rounded bg-muted/50" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="grid grid-cols-5 gap-4 border-b border-border px-4 py-3">
          <div className="h-3 rounded bg-muted/30" />
          <div className="h-3 rounded bg-muted/30" />
          <div className="h-3 rounded bg-muted/40" />
          <div className="h-3 rounded bg-muted/20" />
          <div className="h-3 rounded bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

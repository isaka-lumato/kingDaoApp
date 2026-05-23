import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatTzs, formatTzsCompact } from "@/lib/money";
import { formatDate, formatRelative } from "@/lib/dates";
import { PIPELINE_STAGES } from "@/lib/pipeline";

export const metadata: Metadata = { title: "Dashboard — KDL Tracker" };

const FUNNEL_FIELDS = [
  { key: "manifest_action", label: "Manifest" },
  { key: "shipping_action", label: "Shipping" },
  { key: "tanesws_action", label: "TANESWS" },
  { key: "assessment_action", label: "Assessment" },
  { key: "tbs_loading_action", label: "TBS Load" },
  { key: "tbs_debit_action", label: "TBS Debit" },
  { key: "manifest_comp_action", label: "Mfst Comp" },
  { key: "duty_action", label: "Duty" },
  { key: "inspection_action", label: "Inspection" },
  { key: "ready_to_release", label: "Ready" },
] as const;

type ArrivalRow = {
  id: string;
  ref_no: string;
  year: number;
  vessel_name: string | null;
  arrival_date: string;
  container_count: number | null;
  container_type: string | null;
  clients: { name: string } | { name: string }[] | null;
};

type StuckRow = {
  consignment_id: string;
  ref_no: string;
  year: number;
  client_name: string;
  stage: string;
  hours_stuck: number;
  stuck_since: string;
};

function stageLabelFor(dbStage: string): string {
  const match = PIPELINE_STAGES.find(
    (s) => s.field.replace(/_status$/, "") === dbStage,
  );
  return match?.label ?? dbStage;
}

function clientName(c: ArrivalRow["clients"]): string {
  if (!c) return "—";
  if (Array.isArray(c)) return c[0]?.name ?? "—";
  return c.name ?? "—";
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const today = new Date();
  const year = today.getFullYear();

  // Week window — Mon..Sun anchored to today (calendar week, not rolling 7d).
  const dow = today.getDay(); // 0 = Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const weekStartISO = weekStart.toISOString().slice(0, 10);
  const weekEndISO = weekEnd.toISOString().slice(0, 10);

  // Month window for "Revenue this month" — calendar month of today.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const monthLabel = monthStart.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  // Today window for "Released today".
  const todayISO = today.toISOString().slice(0, 10);

  // Run every read in parallel.
  const [
    funnelRes,
    releasedTodayRes,
    pendingReleaseRes,
    revenueRes,
    arrivalsRes,
    topClientsRes,
    stuckRes,
    totalActiveRes,
  ] = await Promise.all([
    supabase
      .from("v_pipeline_funnel")
      .select("*")
      .eq("year", year)
      .maybeSingle(),
    supabase
      .from("consignments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("release_status", "Released")
      .eq("release_date", todayISO),
    supabase
      .from("consignments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .neq("release_status", "Released"),
    supabase
      .from("consignments")
      .select("amount")
      .is("deleted_at", null)
      .eq("release_status", "Released")
      .gte("release_date", monthStartISO)
      .not("amount", "is", null),
    supabase
      .from("consignments")
      .select(
        "id, ref_no, year, vessel_name, arrival_date, container_count, container_type, clients(name)",
      )
      .is("deleted_at", null)
      .gte("arrival_date", weekStartISO)
      .lt("arrival_date", weekEndISO)
      .order("arrival_date", { ascending: true })
      .limit(20),
    supabase
      .from("v_client_volume")
      .select("client_id, client_name, sub_label, total_containers, job_count")
      .eq("year", year)
      .order("total_containers", { ascending: false })
      .limit(5),
    supabase
      .from("v_stuck_stages")
      .select(
        "consignment_id, ref_no, year, client_name, stage, hours_stuck, stuck_since",
      )
      .order("hours_stuck", { ascending: false })
      .limit(10),
    supabase
      .from("consignments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("year", year),
  ]);

  const funnel = funnelRes.data;
  const releasedToday = releasedTodayRes.count ?? 0;
  const pendingRelease = pendingReleaseRes.count ?? 0;
  const totalActive = totalActiveRes.count ?? 0;

  const revenueThisMonth =
    (revenueRes.data ?? []).reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0,
    );
  const revenueCount = revenueRes.data?.length ?? 0;

  const arrivals = (arrivalsRes.data ?? []) as ArrivalRow[];
  const topClients = topClientsRes.data ?? [];
  const stuck = (stuckRes.data ?? []) as StuckRow[];

  // For the funnel bar, normalise to the largest value so all stages stay
  // visible even when one stage spikes.
  const funnelValues = FUNNEL_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    value: Number(funnel?.[f.key as keyof typeof funnel] ?? 0),
  }));
  const funnelMax = Math.max(1, ...funnelValues.map((f) => f.value));

  const anyFatalError =
    funnelRes.error ||
    releasedTodayRes.error ||
    pendingReleaseRes.error ||
    revenueRes.error ||
    arrivalsRes.error ||
    topClientsRes.error ||
    stuckRes.error;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Overview for {year} · {totalActive} consignment
            {totalActive === 1 ? "" : "s"} on the books
          </p>
        </div>
      </div>

      {anyFatalError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          One or more dashboard widgets failed to load. Try refreshing; if the
          problem persists, check the server logs.
        </div>
      )}

      {/* ── Active jobs row ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Released today"
          value={releasedToday}
          tone="done"
        />
        <Kpi
          label="Pending release"
          value={pendingRelease}
          tone="action"
          href="/consignments?stage=unreleased"
        />
        <Kpi
          label="Stuck > 48h"
          value={stuck.length}
          tone={stuck.length > 0 ? "stuck" : "waiting"}
          href="/consignments?stage=stuck"
        />
        <Kpi
          label={`Revenue · ${monthLabel}`}
          value={formatTzsCompact(revenueThisMonth)}
          subValue={`${revenueCount} released`}
          tone="brand"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Pipeline funnel ───────────────────────────────────────────── */}
        <section className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Pipeline funnel · {year}
            </h2>
            <span className="text-xs text-muted-foreground">
              Consignments in Action by stage
            </span>
          </div>
          <div className="space-y-2.5">
            {funnelValues.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">
                  {f.label}
                </span>
                <div className="flex-1 h-6 rounded bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-stage-action/60 border-r border-stage-action transition-all"
                    style={{
                      width: `${Math.max(2, (f.value / funnelMax) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-mono font-medium text-foreground w-10 text-right tabular-nums">
                  {f.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Released: <strong className="text-stage-done font-semibold">{funnel?.released ?? 0}</strong>
            </span>
            <span>
              Total active: <strong className="text-foreground font-semibold">{funnel?.total_active ?? 0}</strong>
            </span>
          </div>
        </section>

        {/* ── Top clients ───────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Top clients · {year}
            </h2>
            <span className="text-xs text-muted-foreground">by containers</span>
          </div>
          {topClients.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No client data yet for {year}.
            </p>
          ) : (
            <ol className="space-y-3">
              {topClients.map((c, i) => (
                <li
                  key={c.client_id ?? i}
                  className="flex items-center gap-3"
                >
                  <span className="text-xs font-mono text-muted-foreground w-5 tabular-nums">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.client_name ?? "—"}
                    </p>
                    {c.sub_label && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.sub_label}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-foreground tabular-nums">
                      {c.total_containers ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.job_count ?? 0} job{c.job_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Arrivals this week ────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              Arrivals this week
            </h2>
            <span className="text-xs text-muted-foreground">
              {formatDate(weekStartISO)} →{" "}
              {formatDate(
                new Date(weekEnd.getTime() - 86400000).toISOString().slice(0, 10),
              )}
            </span>
          </div>
          {arrivals.length === 0 ? (
            <p className="text-xs text-muted-foreground py-12 text-center">
              No vessel arrivals scheduled this week.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {arrivals.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/consignments/${a.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="text-center shrink-0 w-12">
                      <p className="text-[10px] uppercase text-muted-foreground font-medium">
                        {new Date(a.arrival_date).toLocaleDateString("en-GB", {
                          month: "short",
                        })}
                      </p>
                      <p className="text-lg font-bold text-foreground leading-none tabular-nums">
                        {new Date(a.arrival_date).getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {clientName(a.clients)}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {a.vessel_name ?? "vessel TBC"} ·{" "}
                        {a.container_count ?? "?"} × {a.container_type ?? "—"}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {a.ref_no}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Overdue jobs ──────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              Overdue jobs
            </h2>
            <span className="text-xs text-muted-foreground">
              stuck &gt; 48h · top {Math.min(stuck.length, 10)}
            </span>
          </div>
          {stuck.length === 0 ? (
            <p className="text-xs text-muted-foreground py-12 text-center">
              ✅ Nothing is stuck right now.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {stuck.map((s) => (
                <li key={`${s.consignment_id}-${s.stage}`}>
                  <Link
                    href={`/consignments/${s.consignment_id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="shrink-0">
                      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stage-stuck/15 border border-stage-stuck/40 text-stage-stuck">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          className="w-5 h-5"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path
                            strokeLinecap="round"
                            d="M12 7v5l3 2"
                          />
                        </svg>
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {s.ref_no}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {s.year}
                        </span>
                        <span className="text-xs text-foreground/80 truncate">
                          · {s.client_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Stuck at{" "}
                        <span className="text-stage-stuck font-medium">
                          {stageLabelFor(s.stage)}
                        </span>{" "}
                        · {formatRelative(s.stuck_since)}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-stage-stuck shrink-0 tabular-nums">
                      {Math.floor(s.hours_stuck)}h
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Footer: revenue raw value (compact format used in KPI is approximate) */}
      <p className="text-[11px] text-muted-foreground text-right">
        Revenue this month: <span className="font-mono text-foreground">{formatTzs(revenueThisMonth)}</span>
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  subValue,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  subValue?: string;
  tone: "brand" | "done" | "action" | "stuck" | "waiting";
  href?: string;
}) {
  const toneClass = {
    brand: "border-brand/30 bg-brand/5",
    done: "border-stage-done/30 bg-stage-done/5",
    action: "border-stage-action/30 bg-stage-action/5",
    stuck: "border-stage-stuck/30 bg-stage-stuck/5",
    waiting: "border-border bg-muted/20",
  }[tone];

  const valueToneClass = {
    brand: "text-brand",
    done: "text-stage-done",
    action: "text-stage-action",
    stuck: "text-stage-stuck",
    waiting: "text-foreground",
  }[tone];

  const inner = (
    <div className={`rounded-xl border p-4 transition-colors ${toneClass} ${href ? "hover:bg-opacity-80" : ""}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${valueToneClass}`}>
        {value}
      </p>
      {subValue && (
        <p className="text-[11px] text-muted-foreground mt-0.5">{subValue}</p>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

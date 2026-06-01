import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatTzs, formatTzsCompact } from "@/lib/money";
import { formatDate, formatRelative } from "@/lib/dates";
import { PIPELINE_STAGES } from "@/lib/pipeline";
import { perfTimer } from "@/lib/perf";

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

// Per-query timer for the dashboard fan-out. Hoisted out of the page
// component so the React purity rule doesn't flag `performance.now()` as
// render-time work — this only runs inside awaited promises, which are not
// considered part of the render.
const PERF_ENABLED =
  process.env.PERF_LOG === "1" ||
  process.env.PERF_LOG === "true" ||
  process.env.NODE_ENV !== "production";

async function timedQuery<T>(label: string, p: PromiseLike<T>): Promise<T> {
  if (!PERF_ENABLED) return p;
  const start = performance.now();
  try {
    return await p;
  } finally {
    console.log(
      `[perf] dashboard:${label} ${Math.round(performance.now() - start)}ms`,
    );
  }
}

export default async function DashboardPage() {
  const t = perfTimer("dashboard");
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");
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

  // Run every read in parallel. Each query is wrapped in `timedQuery()` so
  // the slow ones surface individually in the perf log; the whole
  // `Promise.all` is also bracketed by `fanout-start` / `fanout-end`.
  t.mark("fanout-start");
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
    timedQuery(
      "v_pipeline_funnel",
      supabase
        .from("v_pipeline_funnel")
        .select("*")
        .eq("year", year)
        .maybeSingle(),
    ),
    timedQuery(
      "released-today-count",
      supabase
        .from("consignments")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("release_status", "Released")
        .eq("release_date", todayISO),
    ),
    timedQuery(
      "pending-release-count",
      supabase
        .from("consignments")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("release_status", "Released"),
    ),
    timedQuery(
      "revenue-month",
      supabase
        .from("consignments")
        .select("amount")
        .is("deleted_at", null)
        .eq("release_status", "Released")
        .gte("release_date", monthStartISO)
        .not("amount", "is", null),
    ),
    timedQuery(
      "arrivals-week",
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
    ),
    timedQuery(
      "v_client_volume",
      supabase
        .from("v_client_volume")
        .select("client_id, client_name, sub_label, total_containers, job_count")
        .eq("year", year)
        .order("total_containers", { ascending: false })
        .limit(5),
    ),
    timedQuery(
      "v_stuck_stages",
      supabase
        .from("v_stuck_stages")
        .select(
          "consignment_id, ref_no, year, client_name, stage, hours_stuck, stuck_since",
        )
        .order("hours_stuck", { ascending: false })
        .limit(10),
    ),
    timedQuery(
      "total-active-count",
      supabase
        .from("consignments")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("year", year),
    ),
  ]);
  t.mark("fanout-end");

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

  t.end();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview for {year} · {totalActive} consignment
            {totalActive === 1 ? "" : "s"} on the books
          </p>
        </div>
      </header>

      {anyFatalError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          One or more dashboard widgets failed to load. Try refreshing; if the
          problem persists, check the server logs.
        </div>
      )}

      {/* ── Active jobs row ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Released today" value={releasedToday} tone="done" />
        <Kpi
          label="Pending release"
          value={pendingRelease}
          tone="action"
          href="/consignments?stage=unreleased"
        />
        <Kpi
          label="Stuck over 48h"
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Pipeline funnel ───────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <SectionHeader
            title="Pipeline funnel"
            meta={`Consignments in action · ${year}`}
          />
          <div className="mt-5 space-y-3">
            {funnelValues.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {f.label}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-muted/40">
                  <div
                    className="h-full rounded-md bg-brand/55 transition-all"
                    style={{
                      width: `${Math.max(2, (f.value / funnelMax) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-xs font-medium tabular-nums text-foreground">
                  {f.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              Released:{" "}
              <strong className="font-semibold text-stage-done">
                {funnel?.released ?? 0}
              </strong>
            </span>
            <span>
              Total active:{" "}
              <strong className="font-semibold text-foreground">
                {funnel?.total_active ?? 0}
              </strong>
            </span>
          </div>
        </section>

        {/* ── Top clients ───────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <SectionHeader title="Top clients" meta="by containers" />
          {topClients.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No client data yet for {year}.
            </p>
          ) : (
            <ol className="mt-5 space-y-4">
              {topClients.map((c, i) => (
                <li key={c.client_id ?? i} className="flex items-center gap-3">
                  <span className="w-5 font-mono text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.client_name ?? "—"}
                    </p>
                    {c.sub_label && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.sub_label}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Arrivals this week ────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader
              title="Arrivals this week"
              meta={`${formatDate(weekStartISO)} → ${formatDate(
                new Date(weekEnd.getTime() - 86400000)
                  .toISOString()
                  .slice(0, 10),
              )}`}
            />
          </div>
          {arrivals.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              No vessel arrivals scheduled this week.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {arrivals.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/consignments/${a.id}`}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="w-12 shrink-0 text-center">
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">
                        {new Date(a.arrival_date).toLocaleDateString("en-GB", {
                          month: "short",
                        })}
                      </p>
                      <p className="text-lg font-semibold leading-none tabular-nums text-foreground">
                        {new Date(a.arrival_date).getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {clientName(a.clients)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.vessel_name ?? "vessel TBC"} ·{" "}
                        {a.container_count ?? "?"} × {a.container_type ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {a.ref_no}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Overdue jobs ──────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="px-6 pt-5 pb-4">
            <SectionHeader
              title="Overdue jobs"
              meta={`stuck over 48h · top ${Math.min(stuck.length, 10)}`}
            />
          </div>
          {stuck.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              Nothing is stuck right now.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {stuck.map((s) => (
                <li key={`${s.consignment_id}-${s.stage}`}>
                  <Link
                    href={`/consignments/${s.consignment_id}`}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                  >
                    <span
                      aria-hidden
                      className="h-9 w-1 shrink-0 rounded-full bg-stage-stuck/70"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {s.ref_no}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {s.year}
                        </span>
                        <span className="truncate text-xs text-foreground/80">
                          · {s.client_name}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Stuck at{" "}
                        <span className="font-medium text-stage-stuck">
                          {stageLabelFor(s.stage)}
                        </span>{" "}
                        · {formatRelative(s.stuck_since)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-stage-stuck">
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
      <p className="text-right text-[11px] text-muted-foreground">
        Revenue this month:{" "}
        <span className="font-mono text-foreground">
          {formatTzs(revenueThisMonth)}
        </span>
      </p>
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
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
  const dotClass = {
    brand: "bg-brand",
    done: "bg-stage-done",
    action: "bg-stage-action",
    stuck: "bg-stage-stuck",
    waiting: "bg-muted-foreground/40",
  }[tone];

  const valueToneClass = {
    brand: "text-brand",
    done: "text-stage-done",
    action: "text-stage-action",
    stuck: "text-stage-stuck",
    waiting: "text-foreground",
  }[tone];

  const inner = (
    <div
      className={`flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all ${
        href ? "hover:border-foreground/15 hover:bg-muted/20" : ""
      }`}
    >
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueToneClass}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {subValue ?? " "}
      </p>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

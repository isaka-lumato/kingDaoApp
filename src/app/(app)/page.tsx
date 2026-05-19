import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();

  // Quick stats from the DB.
  const { count: activeCount } = await supabase
    .from("consignments")
    .select("*", { count: "exact", head: true })
    .eq("release_status", "Waiting")
    .is("deleted_at", null);

  const { count: releasedToday } = await supabase
    .from("consignments")
    .select("*", { count: "exact", head: true })
    .eq("release_date", new Date().toISOString().slice(0, 10))
    .is("deleted_at", null);

  const stats = [
    {
      id: "stat-active",
      label: "Active consignments",
      value: activeCount ?? 0,
      color: "text-brand",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      id: "stat-released-today",
      label: "Released today",
      value: releasedToday ?? 0,
      color: "text-stage-done",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live overview of all import consignments.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.id}
            id={s.id}
            className="rounded-xl border border-border bg-card p-5 space-y-3"
          >
            <div className={`${s.color} opacity-80`}>{s.icon}</div>
            <div>
              <p className="text-3xl font-bold text-foreground">{s.value}</p>
              <p className="text-muted-foreground text-sm mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Pipeline Funnel</h2>
          <p className="text-muted-foreground text-sm">
            Coming soon — T-040 (Kanban board).
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Stuck Jobs</h2>
          <p className="text-muted-foreground text-sm">
            Coming soon — T-054 (Dashboard widgets).
          </p>
        </div>
      </div>
    </div>
  );
}

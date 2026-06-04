"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { formatTzs } from "@/lib/money";
import BatchLink from "@/components/batch-link";
import { PIPELINE_STAGES, resolveActiveStage, type StageField } from "@/lib/pipeline";

type Client = { id: string; name: string };
type Row = {
  id: string;
  ref_no: string;
  year: number;
  serial_no: number | null;
  tansad_no: string | null;
  bl_number: string | null;
  in_ref: string | null;
  client_id: string;
  container_count: number | null;
  container_type: string | null;
  goods_description: string | null;
  vessel_name: string | null;
  arrival_date: string | null;
  amount: number | null;
  release_status: string;
  release_date: string | null;
  manifest_status: string;
  shipping_batch_status: string;
  tanesws_status: string;
  assessment_status: string;
  tbs_loading_status: string;
  tbs_debit_status: string;
  manifest_comp_status: string;
  duty_status: string;
  inspection_file_status: string;
  updated_at: string;
  clients: { id: string; name: string } | null;
};

type Props = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  year: number;
  clients: Client[];
  filters: { client?: string; stage?: string; q?: string };
  fetchError?: string;
};

const STAGE_COLORS: Record<string, string> = {
  Done: "bg-stage-done/15 text-stage-done border-stage-done/30",
  Action: "bg-stage-action/15 text-stage-action border-stage-action/30",
  Waiting: "bg-stage-waiting/15 text-stage-waiting border-stage-waiting/30",
};

function StageBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STAGE_COLORS[status] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {status}
    </span>
  );
}

/** Compute the "current active stage" label for a row */
function currentStageLabel(row: Row): string {
  const stageValues: Record<StageField, string> = {
    manifest_status: row.manifest_status,
    shipping_batch_status: row.shipping_batch_status,
    tanesws_status: row.tanesws_status,
    assessment_status: row.assessment_status,
    tbs_loading_status: row.tbs_loading_status,
    tbs_debit_status: row.tbs_debit_status,
    manifest_comp_status: row.manifest_comp_status,
    duty_status: row.duty_status,
    inspection_file_status: row.inspection_file_status,
    release_status: row.release_status,
  };
  const activeField = resolveActiveStage(stageValues);
  const active = PIPELINE_STAGES.find((s) => s.field === activeField);
  if (!active) return "—";

  const status = stageValues[activeField];
  if (activeField === "release_status" && status === active.doneValue) {
    return "Released";
  }
  return `${active.label} — ${status}`;
}

export default function ConsignmentsClient({
  rows,
  total,
  page,
  pageSize,
  year,
  clients,
  filters,
  fetchError,
}: Props) {
  const router = useRouter();
  // D-043: useTransition keeps the previously-rendered rows visible (with a
  // subtle opacity fade) while the new query runs server-side. Without this,
  // any filter change unmounts the table and shows the loading skeleton —
  // jarring on a fast-feeling page.
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.ceil(total / pageSize);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { year: String(year), ...filters, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return `/consignments?${params.toString()}`;
  }

  function navigate(href: string) {
    startTransition(() => router.push(href));
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    navigate(buildUrl({ q: fd.get("q") as string, page: "1" }));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Consignments</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total.toLocaleString()} record{total !== 1 ? "s" : ""} · {year}
          </p>
        </div>
        <Link
          href="/consignments/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New consignment
        </Link>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Year tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={buildUrl({ year: String(y), page: "1" })}
              className={[
                "px-3 py-1.5 transition-colors",
                y === year
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-card text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              {y}
            </Link>
          ))}
        </div>

        {/* Client filter */}
        <select
          value={filters.client ?? ""}
          onChange={(e) => navigate(buildUrl({ client: e.target.value || undefined, page: "1" }))}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Stage filter */}
        <select
          value={filters.stage ?? ""}
          onChange={(e) => navigate(buildUrl({ stage: e.target.value || undefined, page: "1" }))}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="unreleased">Unreleased only</option>
          <option value="stuck">Stuck &gt; 48h</option>
        </select>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-1 ml-auto">
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search ref no…"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-40"
          />
          <button
            type="submit"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Search
          </button>
        </form>

        {/* Pending indicator — subtle so it doesn't shout, but visible. */}
        {isPending && (
          <span
            className="text-xs text-muted-foreground flex items-center gap-1.5"
            aria-live="polite"
          >
            <span className="inline-block w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {/* Mobile card list */}
      <ul
        className={[
          "md:hidden flex flex-col gap-2 transition-opacity duration-150",
          isPending ? "opacity-60" : "opacity-100",
        ].join(" ")}
      >
        {rows.length === 0 && (
          <li className="rounded-xl border border-border bg-card px-4 py-10 text-center text-muted-foreground text-sm">
            No consignments found.
          </li>
        )}
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/consignments/${row.id}`}
              className="block rounded-xl border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {row.ref_no}
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 shrink-0">
                    {row.year}
                  </span>
                </div>
                <span className="text-[10px] text-foreground/70 shrink-0">
                  {currentStageLabel(row)}
                </span>
              </div>
              <p className="text-xs font-semibold text-foreground/90 mt-1 truncate">
                {(row.clients as unknown as { name: string } | null)?.name ?? "—"}
              </p>
              {row.bl_number && (
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                  B/L {row.bl_number}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-muted-foreground">
                <span className="truncate">
                  {row.vessel_name ? `⚓ ${row.vessel_name}` : ""}
                  {row.arrival_date
                    ? ` · ${new Date(row.arrival_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}`
                    : ""}
                </span>
                {row.amount != null && (
                  <span className="shrink-0 font-mono">{formatTzs(row.amount)}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop table — fades during transition so the stale rows stay readable
          but visibly "in-flight." */}
      <div
        className={[
          "hidden md:block rounded-xl border border-border overflow-hidden transition-opacity duration-150",
          isPending ? "opacity-60" : "opacity-100",
        ].join(" ")}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Ref No</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Client</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">B/L</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden lg:table-cell">In Ref</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden lg:table-cell">Vessel</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden lg:table-cell">Arrival</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Pipeline Stage</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden xl:table-cell">Amount</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    No consignments found.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/consignments/${row.id}`)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono font-bold text-foreground text-xs">{row.ref_no}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{row.year}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground/80 font-medium text-xs max-w-[140px] truncate">
                    {(row.clients as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell font-mono">
                    {row.bl_number ?? "—"}
                  </td>
                  <td
                    className="px-4 py-3 text-xs hidden lg:table-cell whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.in_ref ? (
                      <BatchLink
                        inRef={row.in_ref}
                        clientId={row.client_id}
                        year={row.year}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell max-w-[120px] truncate">
                    {row.vessel_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell whitespace-nowrap">
                    {row.arrival_date
                      ? new Date(row.arrival_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-foreground/70">{currentStageLabel(row)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono hidden xl:table-cell whitespace-nowrap">
                    {row.amount != null ? formatTzs(row.amount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/consignments/${row.id}`}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

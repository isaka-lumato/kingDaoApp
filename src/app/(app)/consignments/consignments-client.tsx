"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { maskedTzs } from "@/lib/money";
import { useColumnPermission } from "@/hooks/use-permissions";
import { useConsignmentsRealtime } from "@/hooks/use-consignments-realtime";
import { queryKeys } from "@/lib/query-keys";
import { listConsignmentsAction } from "@/server/actions/consignments-list";

import { currentStageLabel } from "@/lib/pipeline";
import {
  buildListSearch,
  type ConsignmentListPage,
  type ConsignmentListRow as Row,
  type ListView,
  type SortKey,
  type SortDir,
} from "@/lib/consignments-list";

type Client = { id: string; name: string };

type Props = {
  /** The page the server rendered — seeds the cache for `initialView`'s key. */
  initialPage: ConsignmentListPage;
  /** The view the server rendered, parsed from the URL's search params. */
  initialView: ListView;
  pageSize: number;
  clients: Client[];
};

/**
 * Clickable sortable column header. Sortable columns only (D-056) — Client +
 * Pipeline Stage are not server-sortable and render as plain `<th>`s.
 */
function SortHeader({
  column,
  label,
  activeSort,
  activeDir,
  onSort,
  align = "left",
  className = "",
}: {
  column: SortKey;
  label: string;
  activeSort: SortKey;
  activeDir: SortDir;
  onSort: (column: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = activeSort === column;
  return (
    <th
      className={`px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={[
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" ? "flex-row-reverse" : "",
          active ? "text-foreground" : "",
        ].join(" ")}
        aria-label={`Sort by ${label}${active ? ` (${activeDir === "asc" ? "ascending" : "descending"})` : ""}`}
      >
        {label}
        <span className="text-[9px] leading-none w-2 inline-block">
          {active ? (activeDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

export default function ConsignmentsClient({
  initialPage,
  initialView,
  pageSize,
  clients,
}: Props) {
  const router = useRouter();
  const { canRead: canSeeAmount } = useColumnPermission("consignments", "amount");

  // D-065: the view lives in client state and drives both the query key and the
  // address bar. Previously every filter change was a `router.push()` → full RSC
  // round-trip with no cache, so revisiting a filter refetched it. Now the URL
  // is kept in sync for shareability/back-forward, but the data comes from the
  // TanStack Query cache — a revisited combination renders instantly.
  const [view, setView] = useState<ListView>(initialView);

  // Seed only the exact key the server rendered. `useState` holds the initial
  // view for the component's lifetime, so this stays true across re-renders and
  // the seed is never wrongly applied to a different filter combination.
  const [seedView] = useState<ListView>(initialView);
  const isSeedView = buildListSearch(view) === buildListSearch(seedView);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.consignments.list(view),
    queryFn: () => listConsignmentsAction(view),
    initialData: isSeedView ? initialPage : undefined,
    // D-043's "stale rows stay visible while the new query runs" feel, now
    // served from the cache instead of a server round-trip.
    placeholderData: keepPreviousData,
  });

  const rows: Row[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const fetchError = data?.error;
  const isPending = isFetching;
  const page = view.page;

  // Another user's change invalidates the consignments keys; TanStack refetches
  // only the mounted (i.e. currently-visible) one.
  useConsignmentsRealtime();

  // Keep the address bar in step with the view without re-running the RSC tree.
  // `router.replace` would re-render the server component and re-fetch what we
  // just cached, so we push history directly — the page reads these params only
  // on a fresh load, which is exactly when we want them honoured.
  useEffect(() => {
    const search = buildListSearch(view);
    if (search !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(null, "", `/consignments?${search}`);
    }
  }, [view]);

  // Back/forward: re-derive the view from the URL the browser restored.
  useEffect(() => {
    function onPopState() {
      const p = new URLSearchParams(window.location.search);
      setView((prev) => ({
        ...prev,
        year: Number(p.get("year")) || prev.year,
        client: p.get("client") || undefined,
        stage: p.get("stage") || undefined,
        q: p.get("q") || undefined,
        sort: (p.get("sort") as SortKey) || prev.sort,
        dir: (p.get("dir") as SortDir) || prev.dir,
        page: Number(p.get("page")) || 1,
      }));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const totalPages = Math.ceil(total / pageSize);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  /** Apply a patch to the view. Any filter change resets to page 1. */
  function patchView(patch: Partial<ListView>) {
    setView((prev) => ({
      ...prev,
      ...patch,
      page: patch.page ?? 1,
    }));
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = ((fd.get("q") as string) ?? "").trim();
    patchView({ q: raw || undefined });
  }

  // Export download URL — carries the exact year + filters + sort + search
  // currently on screen, minus pagination, so the file mirrors the view.
  function exportHref(format: "xlsx" | "pdf") {
    const search = buildListSearch({ ...view, page: 1 });
    return `/api/consignments/export/${format}?${search}`;
  }

  // Click a sortable header: first click sorts ascending; clicking the active
  // column flips direction. Page resets to 1.
  function onSort(column: SortKey) {
    const active = view.sort === column;
    const nextDir: SortDir = active && view.dir === "asc" ? "desc" : "asc";
    patchView({ sort: column, dir: nextDir });
  }

  const exportAnchorCls =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Consignments</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total.toLocaleString()} record{total !== 1 ? "s" : ""} · {view.year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export the current view (all matching rows, current sort) — D-056 */}
          <a href={exportHref("xlsx")} className={exportAnchorCls} download>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            Excel
          </a>
          <a href={exportHref("pdf")} className={exportAnchorCls} download>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-6 4h6m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
            </svg>
            PDF
          </a>
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
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Year tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {yearOptions.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => patchView({ year: y })}
              className={[
                "px-3 py-1.5 transition-colors",
                y === view.year
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-card text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Client filter */}
        <select
          value={view.client ?? ""}
          onChange={(e) => patchView({ client: e.target.value || undefined })}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Stage filter */}
        <select
          value={view.stage ?? ""}
          onChange={(e) => patchView({ stage: e.target.value || undefined })}
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
            defaultValue={view.q ?? ""}
            placeholder="Search ref, B/L, TANSAD, vessel, client…"
            aria-label="Search consignments by ref, B/L, TANSAD, in-ref, vessel, goods, or client"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56 sm:w-64"
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
                {row.client_id ? (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/clients?c=${row.client_id}`);
                    }}
                    className="hover:text-brand hover:underline cursor-pointer"
                  >
                    {(row.clients as unknown as { name: string } | null)?.name ?? "—"}
                  </span>
                ) : (
                  ((row.clients as unknown as { name: string } | null)?.name ?? "—")
                )}
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
                {(!canSeeAmount || row.amount != null) && (
                  <span className="shrink-0 font-mono">
                    {maskedTzs(row.amount, canSeeAmount)}
                  </span>
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
                <SortHeader column="ref_no" label="Ref No" className="text-left" activeSort={view.sort} activeDir={view.dir} onSort={onSort} />
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Client</th>
                <SortHeader column="bl_number" label="B/L" className="text-left hidden md:table-cell" activeSort={view.sort} activeDir={view.dir} onSort={onSort} />

                <SortHeader column="vessel_name" label="Vessel" className="text-left hidden lg:table-cell" activeSort={view.sort} activeDir={view.dir} onSort={onSort} />
                <SortHeader column="arrival_date" label="Arrival" className="text-left hidden lg:table-cell" activeSort={view.sort} activeDir={view.dir} onSort={onSort} />
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Pipeline Stage</th>
                <SortHeader column="amount" label="Amount" align="right" className="text-right hidden xl:table-cell" activeSort={view.sort} activeDir={view.dir} onSort={onSort} />
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
                  <td
                    className="px-4 py-3 text-foreground/80 font-medium text-xs max-w-[140px] truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.client_id ? (
                      <Link
                        href={`/clients?c=${row.client_id}`}
                        className="hover:text-brand hover:underline"
                      >
                        {(row.clients as unknown as { name: string } | null)?.name ?? "—"}
                      </Link>
                    ) : (
                      ((row.clients as unknown as { name: string } | null)?.name ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell font-mono">
                    {row.bl_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell font-mono">
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
                    {!canSeeAmount
                      ? maskedTzs(row.amount, false)
                      : row.amount != null
                        ? maskedTzs(row.amount, true)
                        : "—"}
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
              <button
                type="button"
                onClick={() => patchView({ page: page - 1 })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                ← Prev
              </button>
            )}
            {page < totalPages && (
              <button
                type="button"
                onClick={() => patchView({ page: page + 1 })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

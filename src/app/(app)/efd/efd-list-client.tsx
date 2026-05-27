"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

type Row = {
  id: string;
  efd_code: string;
  efd_time: string | null;
  is_private: boolean;
  is_transit: boolean;
  is_shared: boolean;
  notes: string | null;
  created_at: string;
  link_count: number;
};

type Props = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  filters: { q?: string; flag?: "private" | "transit" | "shared" | "standard" };
  canWrite: boolean;
  fetchError?: string;
};

function FlagBadge({ label, tone }: { label: string; tone: "private" | "transit" | "shared" }) {
  const cls =
    tone === "private"
      ? "bg-violet-500/15 text-violet-600 border-violet-500/30"
      : tone === "transit"
        ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
        : "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

export default function EfdListClient({
  rows,
  total,
  page,
  pageSize,
  filters,
  canWrite,
  fetchError,
}: Props) {
  const router = useRouter();
  const totalPages = Math.ceil(total / pageSize);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...filters, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return `/efd?${params.toString()}`;
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    router.push(buildUrl({ q: (fd.get("q") as string) || undefined, page: "1" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">EFD Records</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total.toLocaleString()} fiscal receipt{total !== 1 ? "s" : ""}
          </p>
        </div>
        {canWrite && (
          <Link
            href="/efd/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New EFD record
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filters.flag ?? ""}
          onChange={(e) =>
            router.push(buildUrl({ flag: e.target.value || undefined, page: "1" }))
          }
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All types</option>
          <option value="standard">Standard (numeric)</option>
          <option value="private">PRIVATE</option>
          <option value="transit">TRANSIT</option>
          <option value="shared">SHARED (≥ 2 consignments)</option>
        </select>

        <form onSubmit={handleSearch} className="flex gap-1 ml-auto">
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search EFD code…"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44"
          />
          <button
            type="submit"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">EFD Code</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Time</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Flags</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Linked</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">Created</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No EFD records found.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/efd/${row.id}`)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono font-bold text-foreground text-xs">{row.efd_code}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {row.efd_time ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.is_private && <FlagBadge label="PRIVATE" tone="private" />}
                      {row.is_transit && <FlagBadge label="TRANSIT" tone="transit" />}
                      {row.is_shared && <FlagBadge label="SHARED" tone="shared" />}
                      {!row.is_private && !row.is_transit && !row.is_shared && (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-foreground/80 font-medium">
                    {row.link_count}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/efd/${row.id}`}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={buildUrl({ page: String(page - 1) })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a
                href={buildUrl({ page: String(page + 1) })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

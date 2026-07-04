"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  listActivityAction,
  listUsageAction,
  type ActivityPage,
  type ActivityRow,
} from "@/server/actions/activity";
import { queryKeys } from "@/lib/query-keys";
import {
  renderAuditValue,
  renderColumnLabel,
  renderTableLabel,
  isSentinelColumn,
} from "@/lib/audit-format";
import { formatDateTime, formatRelative } from "@/lib/dates";

type Actor = { id: string; email: string };

type Props = {
  initialChanges: ActivityPage;
  actors: Actor[];
  fetchError?: string;
};

// Tables that appear in the audit log and are worth filtering by.
const TABLE_FILTERS = [
  { value: "", label: "All tables" },
  { value: "consignments", label: "Consignments" },
  { value: "efd_records", label: "EFD records" },
  { value: "clients", label: "Clients" },
  { value: "roles", label: "Roles" },
  { value: "user_roles", label: "User roles" },
  { value: "role_column_permissions", label: "Permissions" },
];

export default function ActivityClient({ initialChanges, actors, fetchError }: Props) {
  const [tab, setTab] = useState<"changes" | "usage">("changes");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Everything happening across the app — every change, and who&apos;s been active.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "changes"} onClick={() => setTab("changes")}>
          Changes
        </TabButton>
        <TabButton active={tab === "usage"} onClick={() => setTab("usage")}>
          Usage
        </TabButton>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {tab === "changes" ? (
        <ChangesTab initial={initialChanges} actors={actors} />
      ) : (
        <UsageTab />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
        active
          ? "border-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ── Changes tab ──────────────────────────────────────────────────────────────

function ChangesTab({ initial, actors }: { initial: ActivityPage; actors: Actor[] }) {
  const [page, setPage] = useState(0);
  const [tableName, setTableName] = useState("");
  const [actorId, setActorId] = useState("");

  // Cache reads keyed by the active filters + page (D-056). The server already
  // fetched page 0 / no filters for SSR — seed that exact key via `initialData`
  // so the first paint is unchanged and revisited pages/filters are instant.
  // `keepPreviousData` keeps the prior rows visible (with a fade) while the new
  // page loads, preserving the D-043 feel.
  const filters = { tableName: tableName || undefined, actorId: actorId || undefined, page };
  const isInitialKey = page === 0 && !tableName && !actorId;

  const { data = initial, isFetching } = useQuery({
    queryKey: queryKeys.activity.changes(filters),
    queryFn: () =>
      listActivityAction({
        page,
        tableName: tableName || undefined,
        actorId: actorId || undefined,
      }),
    initialData: isInitialKey ? initial : undefined,
    placeholderData: keepPreviousData,
  });

  const isPending = isFetching;

  function onFilterChange(patch: { tableName?: string; actorId?: string }) {
    if (patch.tableName !== undefined) setTableName(patch.tableName);
    if (patch.actorId !== undefined) setActorId(patch.actorId);
    setPage(0);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={tableName}
          onChange={(e) => onFilterChange({ tableName: e.target.value })}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {TABLE_FILTERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={actorId}
          onChange={(e) => onFilterChange({ actorId: e.target.value })}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All users</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.email}</option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground ml-auto">
          {data.totalCount} change{data.totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {data.rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">
            No activity matches these filters.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className={`w-full text-sm ${isPending ? "opacity-60" : ""} transition-opacity`}>
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">When</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Record</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Field</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">From</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <ChangeRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between text-sm">
        <button
          disabled={page === 0 || isPending}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/40 transition-colors"
        >
          ← Newer
        </button>
        <span className="text-muted-foreground">Page {page + 1}</span>
        <button
          disabled={!data.hasMore || isPending}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/40 transition-colors"
        >
          Older →
        </button>
      </div>
    </div>
  );
}

function ChangeRow({ row }: { row: ActivityRow }) {
  const sentinel = isSentinelColumn(row.columnName);
  return (
    <tr className="hover:bg-muted/20 transition-colors align-top">
      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap" title={formatDateTime(row.occurredAt)}>
        {formatRelative(row.occurredAt)}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.actorEmail ?? "system"}</td>
      <td className="px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">{renderTableLabel(row.tableName)}</span>
        {row.tableName === "consignments" && row.rowId && row.refNo ? (
          <>
            {" "}
            <Link
              href={`/consignments/${row.rowId}`}
              className="font-mono font-medium text-brand hover:underline"
            >
              {row.refNo}
            </Link>
          </>
        ) : null}
      </td>
      <td className="px-4 py-2.5 text-xs font-medium text-foreground">
        {renderColumnLabel(row.columnName)}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground break-all">
        {sentinel ? "—" : renderAuditValue(row.oldValue)}
      </td>
      <td className="px-4 py-2.5 text-xs text-foreground break-all">
        {sentinel ? "—" : renderAuditValue(row.newValue)}
      </td>
    </tr>
  );
}

// ── Usage tab ────────────────────────────────────────────────────────────────

function UsageTab() {
  // Cached read (D-056): lazy-loads on first tab open, then served from cache
  // on subsequent Changes↔Usage flips instead of refetching every mount.
  const { data, isPending } = useQuery({
    queryKey: queryKeys.activity.usage(),
    queryFn: listUsageAction,
  });
  const error = data?.error ?? null;
  const users = error ? null : data?.users ?? null;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (isPending || !users) {
    return (
      <div className="rounded-xl border border-border px-4 py-10 text-center text-muted-foreground text-sm animate-pulse">
        Loading usage…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last sign-in</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions (30d)</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => {
            const inactive = !u.lastActionAt && u.actionCount30d === 0;
            return (
              <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 text-foreground">{u.email}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">
                  {u.roles.join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground" title={formatDateTime(u.lastSignIn)}>
                  {u.lastSignIn ? formatRelative(u.lastSignIn) : "never"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {u.actionCount30d}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {u.lastActionAt ? (
                    <span title={formatDateTime(u.lastActionAt)}>{formatRelative(u.lastActionAt)}</span>
                  ) : inactive ? (
                    <span className="text-amber-600 dark:text-amber-400">— inactive</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

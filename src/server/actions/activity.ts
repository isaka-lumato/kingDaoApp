"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { listUsersAction } from "@/server/actions/settings-users";

// ── Access guard ─────────────────────────────────────────────────────────────
// Activity is admin-only by default, but any role granted read on the synthetic
// ('audit_log','read') permission can also see it (D-055). canRead() returns
// true for admins unconditionally, so this single check covers both paths.

async function requireActivityAccess() {
  const perms = await getServerPermissions();
  if (!perms || !perms.canRead("audit_log", "read")) {
    throw new Error("Forbidden: activity access required.");
  }
  return perms;
}

/** Cheap re-usable predicate for the page-level gate (no throw). */
export async function canViewActivity(): Promise<boolean> {
  const perms = await getServerPermissions();
  return !!perms && perms.canRead("audit_log", "read");
}

const PAGE_SIZE = 50;

export type ActivityRow = {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorEmail: string | null;
  tableName: string;
  rowId: string | null;
  columnName: string;
  oldValue: unknown;
  newValue: unknown;
  /** ref_no for consignment rows, resolved for the human-readable link. */
  refNo: string | null;
};

export type ActivityPage = {
  rows: ActivityRow[];
  totalCount: number;
  hasMore: boolean;
  error?: string;
};

/**
 * Paginated global audit feed (newest first), optionally filtered by table or
 * actor. Resolves consignment row_ids to ref_no so the UI can show a reference
 * and deep-link.
 */
export async function listActivityAction(params: {
  tableName?: string;
  actorId?: string;
  page?: number;
}): Promise<ActivityPage> {
  await requireActivityAccess();
  const supabase = await getSupabaseServerClient();

  const page = Math.max(0, params.page ?? 0);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("audit_log")
    .select(
      "id, occurred_at, actor_id, actor_email, table_name, row_id, column_name, old_value, new_value",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .range(from, to);

  if (params.tableName) query = query.eq("table_name", params.tableName);
  if (params.actorId) query = query.eq("actor_id", params.actorId);

  const { data, count, error } = await query;
  if (error) {
    return { rows: [], totalCount: 0, hasMore: false, error: error.message };
  }

  const raw = data ?? [];

  // Resolve consignment ref_no for the rows that point at consignments.
  const consignmentIds = Array.from(
    new Set(
      raw
        .filter((r) => r.table_name === "consignments" && r.row_id)
        .map((r) => r.row_id as string),
    ),
  );

  const refByid = new Map<string, string>();
  if (consignmentIds.length > 0) {
    const { data: refs } = await supabase
      .from("consignments")
      .select("id, ref_no")
      .in("id", consignmentIds);
    for (const c of refs ?? []) refByid.set(c.id, c.ref_no);
  }

  const rows: ActivityRow[] = raw.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    tableName: r.table_name,
    rowId: r.row_id,
    columnName: r.column_name,
    oldValue: r.old_value,
    newValue: r.new_value,
    refNo: r.row_id ? refByid.get(r.row_id) ?? null : null,
  }));

  const totalCount = count ?? 0;
  return { rows, totalCount, hasMore: to + 1 < totalCount };
}

/** Distinct actors present in the audit log, for the filter dropdown. */
export async function listActivityActorsAction(): Promise<{
  actors: { id: string; email: string }[];
  error?: string;
}> {
  await requireActivityAccess();
  const supabase = await getSupabaseServerClient();

  // Pull recent actor rows and dedupe in-process. For ~10 staff this is far
  // cheaper than a DISTINCT RPC and avoids a migration.
  const { data, error } = await supabase
    .from("audit_log")
    .select("actor_id, actor_email")
    .not("actor_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (error) return { actors: [], error: error.message };

  const byId = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.actor_id && !byId.has(r.actor_id)) {
      byId.set(r.actor_id, r.actor_email ?? "(unknown)");
    }
  }
  const actors = Array.from(byId.entries())
    .map(([id, email]) => ({ id, email }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return { actors };
}

export type UsageRow = {
  id: string;
  email: string;
  roles: string[];
  lastSignIn: string | null;
  createdAt: string;
  confirmed: boolean;
  actionCount30d: number;
  lastActionAt: string | null;
};

/**
 * Per-user usage: last sign-in (from Supabase Auth via listUsersAction) merged
 * with action counts/last-action aggregated from audit_log over the last 30
 * days (D-055 — derived, no login-event capture in v1).
 */
export async function listUsageAction(): Promise<{
  users: UsageRow[];
  error?: string;
}> {
  await requireActivityAccess();
  const supabase = await getSupabaseServerClient();

  // 30-day window. Date math is fine at request time (server action).
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, auditRes] = await Promise.all([
    listUsersAction(),
    supabase
      .from("audit_log")
      .select("actor_id, occurred_at")
      .gte("occurred_at", since)
      .not("actor_id", "is", null),
  ]);

  if (usersRes.error) return { users: [], error: usersRes.error };

  // Aggregate per actor: count + most-recent timestamp.
  const counts = new Map<string, number>();
  const lastAt = new Map<string, string>();
  for (const r of auditRes.data ?? []) {
    if (!r.actor_id) continue;
    counts.set(r.actor_id, (counts.get(r.actor_id) ?? 0) + 1);
    const prev = lastAt.get(r.actor_id);
    if (!prev || r.occurred_at > prev) lastAt.set(r.actor_id, r.occurred_at);
  }

  const users: UsageRow[] = usersRes.users.map((u) => ({
    id: u.id,
    email: u.email,
    roles: u.roles.map((r) => r.name),
    lastSignIn: u.lastSignIn,
    createdAt: u.createdAt,
    confirmed: u.confirmed,
    actionCount30d: counts.get(u.id) ?? 0,
    lastActionAt: lastAt.get(u.id) ?? null,
  }));

  // Most recently active first, then never-active by email.
  users.sort((a, b) => {
    if (a.lastActionAt && b.lastActionAt) return b.lastActionAt.localeCompare(a.lastActionAt);
    if (a.lastActionAt) return -1;
    if (b.lastActionAt) return 1;
    return a.email.localeCompare(b.email);
  });

  return { users };
}

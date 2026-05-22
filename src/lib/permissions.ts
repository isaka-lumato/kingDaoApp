import "server-only";
import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ColumnPermission = {
  tableName: string;
  columnName: string;
  canRead: boolean;
  canWrite: boolean;
};

export type UserPermissions = {
  userId: string;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
  /** Look up write permission for a specific table+column. Admins always true. */
  canWrite: (tableName: string, columnName: string) => boolean;
  /** Look up read permission. Admins always true. */
  canRead: (tableName: string, columnName: string) => boolean;
  columns: ColumnPermission[];
};

/**
 * Server-only helper. Fetches the current user's roles and resolved
 * column permissions from the DB. Used in Server Components and Server Actions.
 *
 * Returns null if the user is not authenticated.
 *
 * Perf notes (T-049):
 *  - Uses `auth.getClaims()` for local JWT verification. The canonical session
 *    refresh + Auth-server round-trip is done once per request in
 *    `src/middleware.ts` — this function trusts the verified JWT and stays
 *    on-machine.
 *  - The exported binding is wrapped in React `cache()` so every Server
 *    Component / Server Action within a single request render shares one
 *    result instead of refetching. `cache()` is per-request, not cross-request,
 *    so revoked permissions still take effect on the next navigation.
 *  - The previous 3-step chain (`user_roles` → `roles` → `role_column_permissions`)
 *    is collapsed to 2 round-trips by joining `roles` directly inside the
 *    `role_column_permissions` query via `roles!inner(name)`.
 */
async function getServerPermissionsImpl(): Promise<UserPermissions | null> {
  const supabase = await getSupabaseServerClient();

  // Local JWT verification — no Auth-server round-trip.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const userId = claims.sub as string;
  const email = (claims.email as string | undefined) ?? null;

  // Fetch roles for this user.
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);

  const roles: string[] =
    userRoles?.flatMap((r) => {
      // Supabase may return the FK relation as an object or array depending
      // on whether it's a to-one or to-many join.
      const raw = r.roles as unknown;
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return (raw as { name: string }[]).map((x) => x.name);
      }
      return [(raw as { name: string }).name];
    }) ?? [];

  const isAdmin = roles.includes("admin");

  // Fetch column permissions for all roles this user has.
  // Admins skip this — they have implicit full access.
  let columns: ColumnPermission[] = [];

  if (!isAdmin && roles.length > 0) {
    // Single query: filter `role_column_permissions` by the role *name* via an
    // inner join on `roles`. Saves the prior `SELECT id FROM roles WHERE name IN (...)`
    // round-trip.
    const { data: perms } = await supabase
      .from("role_column_permissions")
      .select("table_name, column_name, can_read, can_write, roles!inner(name)")
      .in("roles.name", roles);

    // Merge: if any role grants write, the user can write.
    const merged = new Map<string, ColumnPermission>();
    for (const p of perms ?? []) {
      const key = `${p.table_name}:${p.column_name}`;
      const existing = merged.get(key);
      if (existing) {
        existing.canRead = existing.canRead || p.can_read;
        existing.canWrite = existing.canWrite || p.can_write;
      } else {
        merged.set(key, {
          tableName: p.table_name,
          columnName: p.column_name,
          canRead: p.can_read,
          canWrite: p.can_write,
        });
      }
    }
    columns = Array.from(merged.values());
  }

  function canWrite(tableName: string, columnName: string): boolean {
    if (isAdmin) return true;
    const p = columns.find(
      (c) => c.tableName === tableName && c.columnName === columnName
    );
    return p?.canWrite ?? false;
  }

  function canRead(tableName: string, columnName: string): boolean {
    if (isAdmin) return true;
    const p = columns.find(
      (c) => c.tableName === tableName && c.columnName === columnName
    );
    return p?.canRead ?? false;
  }

  return {
    userId,
    email,
    roles,
    isAdmin,
    canWrite,
    canRead,
    columns,
  };
}

/**
 * Public binding — memoised for the lifetime of one server render via
 * React `cache()`. All Server Components and Server Actions within a single
 * request share one resolved permission set.
 */
export const getServerPermissions = cache(getServerPermissionsImpl);

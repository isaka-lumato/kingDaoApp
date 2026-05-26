import "server-only";
import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { perfTimer } from "@/lib/perf";
import {
  readPermissionsCache,
  writePermissionsCache,
  type CachedPermissions,
} from "@/lib/permissions-cache";

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
 * Build the cacheable shape into the full `UserPermissions` interface. The
 * closures over `isAdmin` + `columns` cost ~zero so we rebuild them on every
 * call rather than serialising functions into the cache.
 */
function hydrate(data: CachedPermissions): UserPermissions {
  const { isAdmin, columns } = data;
  return {
    userId: data.userId,
    email: data.email,
    roles: data.roles,
    isAdmin,
    columns,
    canWrite(tableName, columnName) {
      if (isAdmin) return true;
      const p = columns.find(
        (c) => c.tableName === tableName && c.columnName === columnName,
      );
      return p?.canWrite ?? false;
    },
    canRead(tableName, columnName) {
      if (isAdmin) return true;
      const p = columns.find(
        (c) => c.tableName === tableName && c.columnName === columnName,
      );
      return p?.canRead ?? false;
    },
  };
}

/**
 * Server-only helper. Fetches the current user's roles and resolved
 * column permissions from the DB. Used in Server Components and Server Actions.
 *
 * Returns null if the user is not authenticated.
 *
 * Perf notes:
 *  - **D-040:** the canonical session refresh is now in `src/middleware.ts`,
 *    which uses `getClaims()` on every request and only round-trips to the
 *    Auth server when the JWT is near expiry. This function trusts the
 *    verified JWT and stays on-machine for auth.
 *  - **D-041:** results are cached cross-request in a module-scoped Map
 *    (`permissions-cache.ts`) keyed by `userId` for 5 minutes. The first hit
 *    after a cold start pays the ~310ms `user_roles` query; subsequent
 *    navigations get a free in-process lookup. Mutation actions invalidate
 *    the cache so role changes take effect immediately.
 *  - The exported binding is also wrapped in React `cache()` so every Server
 *    Component / Server Action within a single request render shares one
 *    result — that layer dedupes within a request, the in-memory cache
 *    dedupes across requests.
 *  - The previous 3-step chain (`user_roles` → `roles` → `role_column_permissions`)
 *    is collapsed to 2 round-trips by joining `roles` directly inside the
 *    `role_column_permissions` query via `roles!inner(name)`.
 */
async function getServerPermissionsImpl(): Promise<UserPermissions | null> {
  const t = perfTimer("permissions");
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  // Local JWT verification — no Auth-server round-trip.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  t.mark("getClaims");
  if (!claims) {
    t.end({ result: "no-claims" });
    return null;
  }

  const userId = claims.sub as string;
  const email = (claims.email as string | undefined) ?? null;

  // Cross-request cache check. If the cached entry still holds, rebuild the
  // canRead/canWrite closures and return — no DB queries fire.
  const cached = readPermissionsCache(userId);
  if (cached) {
    t.end({ result: "cache-hit", roles: cached.roles.length });
    return hydrate(cached);
  }

  // Fetch roles for this user.
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);
  t.mark("user_roles");

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
    t.mark("role_column_permissions");

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

  const payload: CachedPermissions = {
    userId,
    email,
    roles,
    isAdmin,
    columns,
  };
  writePermissionsCache(payload);

  t.end({ roles: roles.length, isAdmin: String(isAdmin), columns: columns.length, result: "cache-miss" });

  return hydrate(payload);
}

/**
 * Public binding — memoised for the lifetime of one server render via
 * React `cache()`. All Server Components and Server Actions within a single
 * request share one resolved permission set.
 */
export const getServerPermissions = cache(getServerPermissionsImpl);

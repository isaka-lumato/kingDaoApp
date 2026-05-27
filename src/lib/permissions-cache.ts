import "server-only";

/**
 * Cross-request permissions cache (D-041).
 *
 * The base `getServerPermissions()` is already wrapped in React `cache()` for
 * per-request memoisation. This module sits *above* that, persisting the
 * resolved permission data in process memory across requests so we don't
 * re-query `user_roles` (~310ms RTT) on every navigation.
 *
 * Scope: one server process. Vercel serverless instances each keep their own
 * map and warm independently — that's fine because the TTL is short and the
 * cache only stores read-only role/column data. No PII beyond what the JWT
 * already carries.
 *
 * Invalidation: the mutation actions in `settings-users.ts` and
 * `settings-roles.ts` call `invalidatePermissionsCache(userId)` /
 * `invalidatePermissionsCacheAll()` so role changes take effect immediately
 * for the affected user(s) on their next navigation. A worst-case stale read
 * of up to `TTL_MS` is bounded by the natural TTL even if invalidation is
 * missed.
 */

export type CachedPermissions = {
  userId: string;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
  columns: Array<{
    tableName: string;
    columnName: string;
    canRead: boolean;
    canWrite: boolean;
  }>;
};

type Entry = {
  data: CachedPermissions;
  expiresAt: number;
};

const TTL_MS = 5 * 60 * 1000;

// Module-scoped Map; survives across requests within one Node process.
// Survival across deploys / serverless cold-starts is *not* guaranteed —
// which is acceptable: a cold start pays the 310ms once.
const store = new Map<string, Entry>();

export function readPermissionsCache(userId: string): CachedPermissions | null {
  const hit = store.get(userId);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    store.delete(userId);
    return null;
  }
  return hit.data;
}

export function writePermissionsCache(data: CachedPermissions): void {
  store.set(data.userId, {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Invalidate one user's cache entry. Call this when a user is assigned to
 * or removed from a role.
 */
export function invalidatePermissionsCache(userId: string): void {
  store.delete(userId);
}

/**
 * Drop every cached entry. Call this when a role's column permissions are
 * edited (the change affects every user holding the role; clearing the whole
 * map is cheaper than enumerating users and there are ~10 staff users total
 * so the warm-up cost is negligible).
 */
export function invalidatePermissionsCacheAll(): void {
  store.clear();
}

/**
 * Internal — only used by tests / diagnostics.
 */
export function _cacheSize(): number {
  return store.size;
}

import "server-only";
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
 */
export async function getServerPermissions(): Promise<UserPermissions | null> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch roles for this user.
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

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
    const { data: roleRows } = await supabase
      .from("roles")
      .select("id")
      .in("name", roles);

    const roleIds = roleRows?.map((r) => r.id) ?? [];

    if (roleIds.length > 0) {
      const { data: perms } = await supabase
        .from("role_column_permissions")
        .select("table_name, column_name, can_read, can_write")
        .in("role_id", roleIds);

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
    userId: user.id,
    email: user.email ?? null,
    roles,
    isAdmin,
    canWrite,
    canRead,
    columns,
  };
}

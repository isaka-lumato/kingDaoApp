"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerPermissions } from "@/lib/permissions";
import { invalidatePermissionsCacheAll } from "@/lib/permissions-cache";
import { z } from "zod";

async function requireAdmin() {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) throw new Error("Forbidden: admin access required.");
}

const createRoleSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, hyphens only"),
  description: z.string().max(200).optional(),
  cloneFromId: z.uuid().optional(),
});

const updatePermSchema = z.object({
  roleId: z.uuid(),
  tableName: z.string(),
  columnName: z.string(),
  canRead: z.preprocess((v) => v === "true" || v === true, z.boolean()),
  canWrite: z.preprocess((v) => v === "true" || v === true, z.boolean()),
});

/**
 * T-035: Create a new custom role, optionally cloning permissions from an
 * existing role.
 */
export async function createRoleAction(formData: FormData) {
  await requireAdmin();

  const parsed = createRoleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    cloneFromId: formData.get("cloneFromId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = getSupabaseAdminClient();

  // Create the role.
  const { data: newRole, error: roleErr } = await admin
    .from("roles")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_system: false,
    })
    .select("id")
    .single();

  if (roleErr) {
    if (roleErr.code === "23505")
      return { error: `A role named "${parsed.data.name}" already exists.` };
    return { error: roleErr.message };
  }

  // If cloning, copy all permissions from the source role.
  if (parsed.data.cloneFromId) {
    const { data: srcPerms } = await admin
      .from("role_column_permissions")
      .select("table_name, column_name, can_read, can_write")
      .eq("role_id", parsed.data.cloneFromId);

    if (srcPerms && srcPerms.length > 0) {
      const newPerms = srcPerms.map((p) => ({
        role_id: newRole.id,
        table_name: p.table_name,
        column_name: p.column_name,
        can_read: p.can_read,
        can_write: p.can_write,
      }));
      const { error: permErr } = await admin
        .from("role_column_permissions")
        .insert(newPerms);
      if (permErr) {
        return {
          error: `Role created but permissions copy failed: ${permErr.message}`,
        };
      }
    }
  }

  revalidatePath("/settings/roles");
  return { success: true, roleId: newRole.id };
}

/**
 * Update a single column permission toggle for a role.
 */
export async function updateColumnPermAction(formData: FormData) {
  await requireAdmin();

  const parsed = updatePermSchema.safeParse({
    roleId: formData.get("roleId"),
    tableName: formData.get("tableName"),
    columnName: formData.get("columnName"),
    canRead: formData.get("canRead"),
    canWrite: formData.get("canWrite"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("role_column_permissions").upsert(
    {
      role_id: parsed.data.roleId,
      table_name: parsed.data.tableName,
      column_name: parsed.data.columnName,
      can_read: parsed.data.canRead,
      can_write: parsed.data.canWrite,
    },
    { onConflict: "role_id,table_name,column_name" }
  );

  if (error) return { error: error.message };

  // Clear all cached permissions — every user holding this role has stale
  // column rules in the cross-request cache (D-041).
  invalidatePermissionsCacheAll();
  revalidatePath("/settings/roles");
  return { success: true };
}

/**
 * Delete a custom role (system roles are protected).
 */
export async function deleteRoleAction(formData: FormData) {
  await requireAdmin();
  const roleId = z.uuid().safeParse(formData.get("roleId"));
  if (!roleId.success) return { error: "Invalid role ID" };

  const admin = getSupabaseAdminClient();

  // Guard: cannot delete system roles.
  const { data: role } = await admin
    .from("roles")
    .select("is_system, name")
    .eq("id", roleId.data)
    .single();

  if (role?.is_system) {
    return { error: `"${role.name}" is a system role and cannot be deleted.` };
  }

  const { error } = await admin.from("roles").delete().eq("id", roleId.data);
  if (error) return { error: error.message };

  // Any cached user who held this role now has a stale roles[] in the cache
  // (D-041). Clearing the whole map is cheaper than enumerating affected
  // users and there are ~10 staff so the warm-up cost is negligible.
  invalidatePermissionsCacheAll();
  revalidatePath("/settings/roles");
  return { success: true };
}

/**
 * List all roles with their column permission counts.
 */
export async function listRolesAction() {
  await requireAdmin();
  const admin = getSupabaseAdminClient();

  const { data: roles, error } = await admin
    .from("roles")
    .select("id, name, description, is_system, created_at")
    .order("is_system", { ascending: false })
    .order("name");

  if (error) return { roles: [], error: error.message };

  const { data: perms } = await admin
    .from("role_column_permissions")
    .select("role_id, can_write");

  // Count write-enabled columns per role.
  const writeCountByRole = new Map<string, number>();
  for (const p of perms ?? []) {
    if (p.can_write) {
      writeCountByRole.set(
        p.role_id,
        (writeCountByRole.get(p.role_id) ?? 0) + 1
      );
    }
  }

  return {
    roles: (roles ?? []).map((r) => ({
      ...r,
      writeableColumnCount: writeCountByRole.get(r.id) ?? 0,
    })),
  };
}

/**
 * Get all column permissions for a specific role.
 */
export async function getRolePermissionsAction(roleId: string) {
  await requireAdmin();
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("role_column_permissions")
    .select("table_name, column_name, can_read, can_write")
    .eq("role_id", roleId)
    .order("table_name")
    .order("column_name");

  if (error) return { permissions: [], error: error.message };
  return { permissions: data ?? [] };
}

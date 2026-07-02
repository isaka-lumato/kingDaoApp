"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerPermissions } from "@/lib/permissions";
import { invalidatePermissionsCache } from "@/lib/permissions-cache";
import { z } from "zod";

// ── Guards ─────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) {
    throw new Error("Forbidden: admin access required.");
  }
  return perms;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  roleId: z.uuid("Role ID required"),
});

// D-058: exactly one role per user. Editing replaces the single current role.
const updateUserRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid("Select a role"),
});

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * T-034: Create a new user with email + temporary password, assign a role.
 * Admin tells the colleague the password directly (internal tool — no SMTP needed).
 * If the user already exists, just assigns the role.
 */
export async function inviteUserAction(formData: FormData) {
  await requireAdmin();

  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    roleId: formData.get("roleId"),
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = getSupabaseAdminClient();

  // Try to create the user with password auth (confirmed immediately).
  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true, // skip email verification — admin is vouching
    });

  let userId: string;

  if (createErr) {
    // If user already exists, find them and just assign the role.
    if (createErr.message.toLowerCase().includes("already been registered") ||
        createErr.message.toLowerCase().includes("already exists")) {
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 500 });
      const existing = listData?.users.find(
        (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase()
      );
      if (!existing) {
        return { error: "User reportedly exists but could not be found." };
      }
      userId = existing.id;
    } else {
      return { error: createErr.message };
    }
  } else {
    if (!created.user?.id) {
      return { error: "User creation succeeded but no user ID returned." };
    }
    userId = created.user.id;
  }

  // Set the selected role as the user's single role (D-058). For an existing
  // user this replaces whatever role they had; the unique constraint keeps it
  // to exactly one row per user.
  const { error: deleteErr } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteErr) {
    return { error: `User created but clearing prior role failed: ${deleteErr.message}` };
  }

  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: parsed.data.roleId });
  if (roleErr) {
    return { error: `User created but role assignment failed: ${roleErr.message}` };
  }

  invalidatePermissionsCache(userId);
  revalidatePath("/settings/users");
  return { success: true, email: parsed.data.email };
}

/**
 * List all users with their assigned roles. Admin only.
 * Returns a plain serializable object (safe to pass to client components).
 */
export async function listUsersAction(): Promise<{
  users: {
    id: string;
    email: string;
    createdAt: string;
    lastSignIn: string | null;
    roles: { id: string; name: string }[];
    confirmed: boolean;
  }[];
  error?: string;
}> {
  await requireAdmin();
  const admin = getSupabaseAdminClient();

  // D-044: the two queries here are independent (one hits the Auth API, the
  // other hits the user_roles table). Fire them in parallel — was 2 serial
  // RTTs (~600ms total), now bounded by the slower one (~300ms).
  const [listRes, userRolesRes] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("user_roles").select("user_id, roles(id, name)"),
  ]);

  const { data, error } = listRes;
  if (error) return { users: [], error: error.message };

  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of userRolesRes.data ?? []) {
    const role = row.roles as unknown as { id: string; name: string } | null;
    if (!role) continue;
    const existing = rolesByUser.get(row.user_id) ?? [];
    existing.push(role);
    rolesByUser.set(row.user_id, existing);
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? "(no email)",
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at ?? null,
    roles: rolesByUser.get(u.id) ?? [],
    confirmed: !!u.email_confirmed_at,
  }));

  return { users };
}

/**
 * Set the single role for an existing user (D-058). Deletes any existing
 * assignment and inserts the selected one, so the user ends up with exactly
 * one role.
 */
export async function updateUserRolesAction(formData: FormData) {
  const perms = await requireAdmin();
  const parsed = updateUserRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { userId, roleId } = parsed.data;
  const admin = getSupabaseAdminClient();

  const { data: role, error: roleErr } = await admin
    .from("roles")
    .select("id, name")
    .eq("id", roleId)
    .single();

  if (roleErr || !role) return { error: "The selected role no longer exists." };

  // An admin cannot demote themselves out of admin — it would lock everyone
  // out of user management if they were the last admin.
  if (perms.userId === userId && role.name !== "admin") {
    return { error: "You cannot change your own role away from admin." };
  }

  // Replace: drop the current role, then assign the chosen one. The unique
  // constraint (user_roles_one_per_user) guarantees at most one row per user.
  const { error: deleteErr } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteErr) return { error: deleteErr.message };

  const { error: insertErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleId });
  if (insertErr) return { error: insertErr.message };

  invalidatePermissionsCache(userId);
  revalidatePath("/settings/users");
  return { success: true };
}

/**
 * Deactivate a user (ban them in Supabase Auth).
 */
export async function deactivateUserAction(formData: FormData) {
  await requireAdmin();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Invalid user ID" };

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId.data, {
    ban_duration: "876600h", // ~100 years
  });

  if (error) return { error: error.message };

  invalidatePermissionsCache(userId.data);
  revalidatePath("/settings/users");
  return { success: true };
}

/**
 * Re-activate a previously banned user.
 */
export async function reactivateUserAction(formData: FormData) {
  await requireAdmin();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Invalid user ID" };

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId.data, {
    ban_duration: "none",
  });

  if (error) return { error: error.message };

  invalidatePermissionsCache(userId.data);
  revalidatePath("/settings/users");
  return { success: true };
}

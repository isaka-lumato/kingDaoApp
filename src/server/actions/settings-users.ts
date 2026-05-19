"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerPermissions } from "@/lib/permissions";
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

const inviteSchema = z.object({
  email: z.email("Valid email required"),
  roleId: z.uuid("Role ID required"),
});

const assignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * T-034: Invite a new user by email and immediately assign a role.
 * Uses the Supabase Admin API (secret key) — never called from client bundles.
 */
export async function inviteUserAction(formData: FormData) {
  await requireAdmin();

  const raw = {
    email: formData.get("email"),
    roleId: formData.get("roleId"),
  };

  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = getSupabaseAdminClient();

  // Invite via Supabase Auth Admin API — sends a magic-link invite email.
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
    });

  if (inviteErr) {
    if (inviteErr.message.toLowerCase().includes("already been registered")) {
      return { error: "A user with this email already exists." };
    }
    return { error: inviteErr.message };
  }

  if (!invited.user?.id) {
    return { error: "Invite succeeded but no user ID returned." };
  }

  // Assign the selected role.
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: invited.user.id, role_id: parsed.data.roleId });

  if (roleErr) {
    return { error: `User invited but role assignment failed: ${roleErr.message}` };
  }

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

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) return { users: [], error: error.message };

  // Fetch all user_roles + role names in one query.
  const { data: userRolesRows } = await admin
    .from("user_roles")
    .select("user_id, roles(id, name)");

  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of userRolesRows ?? []) {
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
 * Assign an additional role to an existing user.
 */
export async function assignRoleAction(formData: FormData) {
  await requireAdmin();
  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: parsed.data.userId, role_id: parsed.data.roleId });

  if (error) {
    if (error.code === "23505") return { error: "Role already assigned." };
    return { error: error.message };
  }

  revalidatePath("/settings/users");
  return { success: true };
}

/**
 * Remove a role from a user.
 */
export async function removeRoleAction(formData: FormData) {
  await requireAdmin();
  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", parsed.data.userId)
    .eq("role_id", parsed.data.roleId);

  if (error) return { error: error.message };

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

  revalidatePath("/settings/users");
  return { success: true };
}

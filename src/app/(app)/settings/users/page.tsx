import type { Metadata } from "next";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { listUsersAction } from "@/server/actions/settings-users";
import UsersClient from "./users-client";

export const metadata: Metadata = { title: "Users — Settings" };

export default async function UsersPage() {
  // Fetch roles for the invite form selector.
  const admin = getSupabaseAdminClient();
  const { data: roles } = await admin
    .from("roles")
    .select("id, name")
    .order("name");

  const { users, error } = await listUsersAction();

  return (
    <UsersClient
      users={users}
      roles={roles ?? []}
      fetchError={error}
    />
  );
}

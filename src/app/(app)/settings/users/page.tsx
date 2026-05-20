import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listUsersAction } from "@/server/actions/settings-users";
import UsersClient from "./users-client";

export const metadata: Metadata = { title: "Users — Settings" };

export default async function UsersPage() {
  // Per T-048 / D-026: roles list is readable by any authenticated user
  // (RLS policy `roles_read_authenticated` from migration 175820).
  // listUsersAction() keeps its admin client — Supabase Admin API requires
  // service role to enumerate users, which is a permitted use per D-026.
  const supabase = await getSupabaseServerClient();
  const { data: roles } = await supabase
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

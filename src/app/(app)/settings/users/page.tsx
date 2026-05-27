import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listUsersAction } from "@/server/actions/settings-users";
import { perfTimer } from "@/lib/perf";
import UsersClient from "./users-client";

export const metadata: Metadata = { title: "Users — Settings" };

export default async function UsersPage() {
  // Per T-048 / D-026: roles list is readable by any authenticated user
  // (RLS policy `roles_read_authenticated` from migration 175820).
  // listUsersAction() keeps its admin client — Supabase Admin API requires
  // service role to enumerate users, which is a permitted use per D-026.
  //
  // D-044: the roles dropdown and listUsersAction() are fully independent.
  // Fire them in parallel — was 3 serial RTTs across the chain
  // (roles + auth.listUsers + user_roles), now bounded by the slowest after
  // the inner parallelization (~300ms instead of ~900ms).
  const t = perfTimer("settings-users");
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  const [rolesRes, usersRes] = await Promise.all([
    supabase.from("roles").select("id, name").order("name"),
    listUsersAction(),
  ]);
  t.mark("parallel-roles+listUsers");

  const { users, error } = usersRes;
  t.end({ users: users.length, roles: (rolesRes.data ?? []).length });

  return (
    <UsersClient
      users={users}
      roles={rolesRes.data ?? []}
      fetchError={error}
    />
  );
}

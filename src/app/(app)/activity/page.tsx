import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerPermissions } from "@/lib/permissions";
import {
  listActivityAction,
  listActivityActorsAction,
} from "@/server/actions/activity";
import ActivityClient from "./activity-client";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  // Gate: admin OR a role granted ('audit_log','read') (D-055). canRead is
  // always true for admins, so this single check covers both.
  const perms = await getServerPermissions();
  if (!perms || !perms.canRead("audit_log", "read")) redirect("/");

  const [first, actors] = await Promise.all([
    listActivityAction({ page: 0 }),
    listActivityActorsAction(),
  ]);

  return (
    <ActivityClient
      initialChanges={first}
      actors={actors.actors}
      fetchError={first.error ?? actors.error}
    />
  );
}

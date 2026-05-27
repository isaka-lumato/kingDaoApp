import type { Metadata } from "next";
import { listRolesAction } from "@/server/actions/settings-roles";
import RolesClient from "./roles-client";

export const metadata: Metadata = { title: "Roles — Settings" };

export default async function RolesPage() {
  const { roles, error } = await listRolesAction();
  return <RolesClient roles={roles ?? []} fetchError={error} />;
}

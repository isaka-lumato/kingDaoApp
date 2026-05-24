import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerPermissions } from "@/lib/permissions";
import ImportClient from "./import-client";

export const metadata: Metadata = { title: "Import Excel — KDL Tracker" };

export default async function ImportPage() {
  const perms = await getServerPermissions();
  if (!perms) redirect("/login");
  if (!perms.isAdmin && !perms.roles.includes("operator")) {
    redirect("/dashboard");
  }

  return <ImportClient />;
}

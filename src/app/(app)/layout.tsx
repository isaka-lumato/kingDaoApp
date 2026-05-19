import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { PermissionsProvider } from "@/hooks/use-permissions";
import AppShell from "./app-shell";

/**
 * (app) route group layout — wraps every protected page.
 * Fetches auth + permissions server-side; passes them to the client shell.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware handles the redirect, but this is a defense-in-depth check.
  if (!user) redirect("/login");

  const permissions = await getServerPermissions();
  if (!permissions) redirect("/login");

  // Serialize only client-safe fields (no functions).
  const clientPerms = {
    userId: permissions.userId,
    email: permissions.email,
    roles: permissions.roles,
    isAdmin: permissions.isAdmin,
    columns: permissions.columns,
  };

  return (
    <PermissionsProvider value={clientPerms}>
      <AppShell user={{ email: user.email ?? "" }}>
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}

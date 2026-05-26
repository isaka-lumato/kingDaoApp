import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getServerPermissions } from "@/lib/permissions";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { perfTimer } from "@/lib/perf";
import AppShell from "./app-shell";
import { NavSkeletonSwap } from "./_nav/nav-skeleton-swap";

/**
 * (app) route group layout — wraps every protected page.
 * Fetches auth + permissions server-side; passes them to the client shell.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = perfTimer("layout(app)");
  const supabase = await getSupabaseServerClient();
  t.mark("supabase-client");

  // T-049: local JWT verify, no Auth-server round-trip.
  // Middleware (src/middleware.ts) is the canonical session refresh point and
  // already called getUser() this request.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  t.mark("getClaims");

  // Middleware handles the redirect, but this is a defense-in-depth check.
  if (!claims) redirect("/login");

  const permissions = await getServerPermissions();
  t.mark("getServerPermissions");
  if (!permissions) redirect("/login");
  t.end();

  // Serialize only client-safe fields (no functions).
  const clientPerms = {
    userId: permissions.userId,
    email: permissions.email,
    roles: permissions.roles,
    isAdmin: permissions.isAdmin,
    columns: permissions.columns,
  };

  const email = (claims.email as string | undefined) ?? "";

  return (
    <PermissionsProvider value={clientPerms}>
      <AppShell user={{ email }}>
        <NavSkeletonSwap>{children}</NavSkeletonSwap>
      </AppShell>
    </PermissionsProvider>
  );
}

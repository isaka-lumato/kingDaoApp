import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  // Sanity check: boot the server client. If the env vars are wrong this throws
  // at request time and we see it immediately rather than in some deeper handler.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">
        KDL Import Consignment Tracker
      </h1>
      <p className="max-w-md text-center text-muted-foreground">
        Foundations are being built. Auth state: {user ? user.email : "signed out"}
      </p>
      <Button>Sample button</Button>
    </main>
  );
}

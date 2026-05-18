import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, getSupabaseSecretKey } from "./env";

/**
 * Admin client using the secret key. Bypasses RLS — use ONLY in trusted
 * server actions / edge functions for operations that legitimately need
 * elevated privileges (user invites, audit log writes from cron, etc.).
 *
 * The `import "server-only"` guard ensures importing this file from any
 * client-bundled module is a build error.
 */
export function getSupabaseAdminClient() {
  return createClient(SUPABASE_URL, getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

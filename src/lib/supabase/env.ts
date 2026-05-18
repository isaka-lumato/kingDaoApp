/**
 * Centralized env access for Supabase. Validates at module load — a missing
 * variable surfaces immediately on app startup rather than as a confusing
 * runtime error deep in a request. See D-020 for the publishable/secret split.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/**
 * Server-only secret. Importing this from a Client Component or any code that
 * reaches the browser bundle will throw at build time (the `process.env`
 * access for a non-`NEXT_PUBLIC_` variable returns undefined on the client).
 */
export function getSupabaseSecretKey(): string {
  return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}

"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/schemas/auth";

/**
 * T-030: Login server action.
 * Validates with zod, attempts signInWithPassword, then redirects.
 * Returns an error string on failure (never throws — callers receive the error).
 */
export async function loginAction(
  formData: FormData
): Promise<{ error: string } | never> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Invalid input" };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Map Supabase error codes to user-friendly messages.
    if (
      error.message.toLowerCase().includes("invalid login") ||
      error.message.toLowerCase().includes("invalid credentials")
    ) {
      return { error: "Incorrect email or password." };
    }
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Please confirm your email address before signing in." };
    }
    return { error: "Sign-in failed. Please try again." };
  }

  // Session is set in cookies by the Supabase client. Redirect to app root.
  redirect("/");
}

/**
 * Sign out the current user and redirect to /login.
 */
export async function logoutAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

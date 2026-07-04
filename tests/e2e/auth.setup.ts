import { expect, test as setup } from "@playwright/test";
import path from "node:path";

/**
 * Authentication setup project (D-056 perf harness). Logs in once and saves the
 * session to a `storageState` file that the other projects reuse, so each spec
 * starts already authenticated instead of driving the login form every time.
 * See https://playwright.dev/docs/auth.
 *
 * Credentials come from the environment (never committed):
 *   E2E_EMAIL / E2E_PASSWORD  — a real user in the DEV Supabase project.
 * If they're unset the setup fails fast with a clear message; the harness still
 * ships as reusable infra and runs once creds are provided.
 */

export const STORAGE_STATE = path.join(__dirname, ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD must be set (a dev Supabase user) to run the " +
        "authenticated e2e/perf suite. Add them to .env.local or your shell.",
    );
  }

  await page.goto("/login");
  // IDs are stable in src/app/(auth)/login/login-form.tsx.
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click("#login-submit-btn");

  // loginAction redirects off /login on success; wait for that to settle.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });

  // Sanity-check we landed in the authed app (the shell renders the nav).
  await expect(page).toHaveURL(/\/(dashboard|consignments|activity)?$|\/$/);

  await page.context().storageState({ path: STORAGE_STATE });
});

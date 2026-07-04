import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Critical-path E2E only (per D-018). Tests live in tests/e2e/.
 * Browsers must be installed once with `pnpm exec playwright install chromium`.
 *
 * Projects:
 *  - `setup`         logs in once and writes storageState (auth.setup.ts).
 *  - `chromium`      authenticated runs (perf.spec, future authed specs); reuses
 *                    the saved session. Excludes the setup + smoke files.
 *  - `chromium-anon` unauthenticated smoke (the public login/landing page).
 *
 * PERF_LOG=1 is passed to the dev server so `[perf]` timing lines surface on its
 * stdout while the perf spec drives the hot paths (D-056).
 */
const STORAGE_STATE = path.join(__dirname, "tests/e2e/.auth/user.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PERF_LOG: "1" },
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      // Authenticated specs only — exclude the setup file and the anon smoke.
      testIgnore: [/auth\.setup\.ts/, /smoke\.spec\.ts/],
    },
    {
      name: "chromium-anon",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /smoke\.spec\.ts/,
    },
  ],
});

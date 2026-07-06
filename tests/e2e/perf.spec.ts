import { test, expect } from "@playwright/test";

/**
 * Perf-capture spec (D-056). This does NOT assert latency numbers — it drives
 * the authenticated hot paths so the dev server emits its `[perf]` timing lines
 * (src/lib/perf.ts) to stdout, where PERF_LOG=1 is set via playwright.config's
 * webServer.env. Read those lines from the dev-server console to get a baseline,
 * then re-run after the caching changes to compare.
 *
 * It also exercises a re-visit on each cached surface (page → back, tab flip)
 * so you can confirm in the browser Network panel that the second hit is served
 * from the TanStack Query cache (no new request) rather than refetched.
 *
 * Runs with the saved auth state (see auth.setup.ts) — no login here.
 */

test.describe("perf hot paths", () => {
  test("dashboard renders", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("pipeline (kanban) renders", async ({ page }) => {
    await page.goto("/");
    // Board lazy-loads; just wait for the shell to settle.
    await page.waitForLoadState("networkidle");
  });

  test("consignments list: paginate and return (cache revisit)", async ({ page }) => {
    await page.goto("/consignments");
    await expect(
      page.getByRole("heading", { name: "Consignments" }),
    ).toBeVisible();

    // Exercise the stuck filter (its own query key) then return to the base
    // list — the return should be a cache hit (D-056).
    await page.goto("/consignments?stage=stuck");
    await page.waitForLoadState("networkidle");
    await page.goto("/consignments");
    await page.waitForLoadState("networkidle");
  });

  test("activity: flip tabs (cache revisit)", async ({ page }) => {
    const res = await page.goto("/activity");
    // Non-admins are redirected away; skip cleanly if so.
    if (res && page.url().includes("/activity")) {
      await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
      await page.getByRole("button", { name: "Usage" }).click();
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Changes" }).click();
      await page.waitForLoadState("networkidle");
    }
  });
});

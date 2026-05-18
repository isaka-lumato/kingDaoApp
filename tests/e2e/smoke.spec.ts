import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("KDL Import Consignment Tracker")).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { ADMIN_APP_URL } from "./playwright.config";
import { ADMIN, adminAppLogin, PASSWORD } from "./support";

// The admin app (#246): its own host, admins only. A non-admin's refusal: band.e2e.ts.

test("an admin logs in to the admin app and sees the numbers", async ({ page }) => {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  for (const label of ["Bands", "Users", "Active users", "Documents storage"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  // The session stays on the admin host: the web app still asks to log in.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("the admin app is not indexed and only reaches the admin API", async ({ request }) => {
  const robots = await request.get(`${ADMIN_APP_URL}/robots.txt`);
  expect(await robots.text()).toContain("Disallow: /");
  expect(robots.headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get(`${ADMIN_APP_URL}/api/bands`)).status()).toBe(404);
  expect((await request.get(`${ADMIN_APP_URL}/api/admin/stats`)).status()).toBe(401);
});

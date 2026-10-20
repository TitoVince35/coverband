import { expect, test } from "@playwright/test";
import { GATED_ACCESS_CODE, GATED_PORT } from "./playwright.config";
import { run } from "./support";

// The server on GATED_PORT runs the same build with a beta access code (#148).
test.use({ baseURL: `http://localhost:${GATED_PORT}` });

test("the beta access code is asked once, then remembered", async ({ page }) => {
  // Code attempts are rate limited per client IP: this test's own address.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `e2e-${run}` });
  await page.goto("/");
  await expect(page).toHaveURL(/\/access/);
  await expect(page.getByText("Private beta")).toBeVisible();
  await expect(page.getByText(/ \d+\.\d+\.\d+ \(dev\)$/)).toBeVisible();

  await page.getByLabel("Access code").fill("a wrong guess");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("This isn't the access code.");

  await page.getByLabel("Access code").fill(GATED_ACCESS_CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  // Through the gate: the pages behind the login send there.
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

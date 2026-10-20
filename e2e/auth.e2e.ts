import { expect, test } from "@playwright/test";
import { ADMIN, login, PASSWORD } from "./support";

test("a wrong password is refused with a clear message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByLabel("Password").fill("not the right password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
  await expect(page).toHaveURL(/\/login/);
});

test("the login page shows the version of the app", async ({ page }) => {
  await page.goto("/login");
  // Served by the e2e build, without BUILD_SHA: the build is "dev".
  await expect(page.getByText(/ \d+\.\d+\.\d+ \(dev\)$/)).toBeVisible();
});

test("logging in and out", async ({ page }) => {
  await login(page, ADMIN, PASSWORD);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  // Pages behind the login send back to it.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

import { devices, expect, test } from "@playwright/test";
import { ADMIN, login, PASSWORD } from "./support";

// Chrome only offers its install prompt to a real user: the iPhone steps are what can be tested.
test.use({ userAgent: devices["iPhone 15"].userAgent });

test("on an iPhone, the home page shows how to install the app, until dismissed", async ({
  page,
}) => {
  await login(page, ADMIN, PASSWORD);
  const card = page.getByText(/^Install /);
  await expect(card).toBeVisible();
  await expect(page.getByText("then Add to Home Screen.")).toBeVisible();
  await page.getByRole("button", { name: "Don't show again" }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Welcome to/ })).toBeVisible();
  await expect(card).toBeHidden();
});

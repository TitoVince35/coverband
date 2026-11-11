import { expect, type Page, test } from "@playwright/test";
import { ADMIN_APP_URL } from "./playwright.config";
import { ADMIN, adminAppLogin, type Band, login, newBand, openAdminRow, PASSWORD } from "./support";

// The admin app and a band (#246 to #249): the band leader kept out, viewed as, the band
// suspended, then deleted.
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Moderated");
  leader = band.leader;
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("the admin app refuses the band leader, who isn't an admin (#246)", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await adminAppLogin(page, band.leaderEmail, PASSWORD);
  await expect(page.getByText("This console is for administrators only.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.context().close();
});

test("an admin finds the band leader in the admin app, then views the app as them (#249)", async ({
  page,
  browser,
}) => {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${ADMIN_APP_URL}/#/users`);
  await page.getByPlaceholder("Search by email or name").fill(band.leaderEmail);
  await expect(page.getByText("1-1 of 1")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: band.leaderEmail });
  await expect(row).toContainText(band.name);
  await expect(row.getByLabel("band leader")).toBeVisible();
  await expect(row).toContainText("Guitar");
  await openAdminRow(page, band.leaderEmail);
  await expect(page.getByRole("heading", { name: "Lea Leader" })).toBeVisible();
  await expect(page.getByText("Last session")).toBeVisible();

  // The admin app opens the web app's page, which starts it once confirmed.
  const link = page.getByRole("link", { name: "View the app as this user" });
  const href = (await link.getAttribute("href")) ?? "";
  expect(href).toMatch(/\/impersonate\/[0-9a-f-]{36}$/);
  const web = await (await browser.newContext()).newPage();
  await login(web, ADMIN, PASSWORD);
  await web.goto(new URL(href).pathname);
  await web.getByRole("button", { name: "View the app as Lea Leader" }).click();
  await expect(web.getByText("Viewing the app as Lea Leader: read-only.")).toBeVisible();
  await expect(web.getByRole("link", { name: band.name })).toBeVisible();
  // Read-only (#214).
  await web.goto("/account");
  await web.getByLabel("Nickname").fill("Hacked");
  await web.getByRole("button", { name: "Update" }).click();
  await expect(web.getByText("Read-only while viewing the app as another user.")).toBeVisible();
  await web.getByRole("button", { name: "Stop" }).click();
  await expect(web.getByText("Viewing the app as Lea Leader")).toBeHidden();
  await web.context().close();
});

/** The admin app, on the e2e band's page. */
async function adminBandPage(page: Page) {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${ADMIN_APP_URL}/#/bands`);
  await page.getByPlaceholder("Search by name").fill(band.name);
  await expect(page.getByText("1-1 of 1")).toBeVisible();
  await openAdminRow(page, band.name);
  await expect(page.getByRole("heading", { name: band.name })).toBeVisible();
}

test("an admin suspends the band: its members only see that, until it's enabled (#248)", async ({
  page,
}) => {
  await adminBandPage(page);
  // Deleting comes only once it's disabled.
  await expect(page.getByRole("button", { name: "Delete band" })).toBeDisabled();
  await page.getByRole("button", { name: "Disable band" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText(/suspended since/)).toBeVisible();
  await expect(page.getByText("E2E Admin suspended the band")).toBeVisible();

  await leader.goto("/");
  await expect(leader.getByText("Suspended")).toBeVisible();
  await leader.getByRole("link", { name: band.name }).first().click();
  await expect(leader.getByRole("heading", { name: "This band is suspended" })).toBeVisible();

  await page.getByRole("button", { name: "Enable band" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enable" }).click();
  await expect(page.getByText(/suspended since/)).toBeHidden();
  await leader.reload();
  await expect(leader.getByRole("heading", { name: band.name })).toBeVisible();
});

// Last: the band is gone afterwards.
test("an admin deletes the band for good, its name typed to confirm (#248)", async ({ page }) => {
  await adminBandPage(page);
  await page.getByRole("button", { name: "Disable band" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await page.getByRole("button", { name: "Delete band" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete for good" });
  await dialog.getByLabel("Type the band's name to confirm").fill("E2E Moderated");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type the band's name to confirm").fill(band.name);
  await confirm.click();
  await expect(page.getByText("Band deleted")).toBeVisible();
  await expect(page.getByText("No results found.")).toBeVisible();

  // The band leader keeps their account, without the band.
  await leader.goto("/");
  await expect(leader.getByRole("link", { name: band.name })).toHaveCount(0);
});

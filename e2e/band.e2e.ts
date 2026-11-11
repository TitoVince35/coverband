import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type Band, login, newBand, PASSWORD, savedCopy, savedCount } from "./support";

// The band's pages: its sections, loading, its logo.
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Pages");
  leader = band.leader;
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("the band's sections: a bottom bar on a phone, tabs on a large screen (#223)", async () => {
  await leader.goto("/");
  await leader.getByRole("link", { name: band.name }).first().click();
  const sections = leader.getByRole("navigation", { name: "Band sections" });
  // Five items: Gigs there already, not a link yet.
  await expect(sections.getByRole("link")).toHaveCount(4);
  await expect(sections.getByRole("link", { name: "Setlists" })).toBeVisible();
  await expect(sections.getByText("Gigs")).toBeVisible();
  // At the bottom of the screen.
  const phone = leader.viewportSize() ?? { width: 393, height: 727 };
  const bar = await sections.boundingBox();
  // Where the browser puts the bottom of the screen for fixed elements.
  const screenBottom = await leader.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position: fixed; bottom: 0; height: 1px";
    document.body.append(probe);
    const bottom = probe.getBoundingClientRect().bottom;
    probe.remove();
    return bottom;
  });
  expect(Math.round((bar?.y ?? 0) + (bar?.height ?? 0))).toBe(Math.round(screenBottom));
  await sections.getByRole("link", { name: "Lineup" }).click();
  await expect(leader).toHaveURL(/\/lineup$/);
  // The keyboard up (the visible height halved): the bar hides, then comes back.
  await leader.setViewportSize({ width: phone.width, height: Math.round(phone.height / 2) });
  await expect(sections).toBeHidden();
  await leader.setViewportSize(phone);
  await expect(sections).toBeVisible();

  // A large screen: the tabs under the band's name.
  await leader.setViewportSize({ width: 1024, height: 768 });
  const tabs = await sections.boundingBox();
  expect(tabs?.y ?? 768).toBeLessThan(300);
  await expect(sections.getByRole("link")).toHaveCount(4);
  await leader.setViewportSize(phone);
});

test("while data loads, a skeleton shows, never a blank page (#190)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // A slow connection: the band list takes a while.
  await page.route("**/api/bands", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await login(page, band.leaderEmail, PASSWORD);
  await expect(page.getByRole("status", { name: "Loading…" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(band.name) })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading…" })).toHaveCount(0);
  await context.close();
});

test("the band leader adds the band's logo: on the band page and in the list, then removed", async () => {
  await leader.goto("/");
  // No logo yet: the band's initials ("E2E Rockers …").
  const bandLink = leader.getByRole("link", { name: band.name }).first();
  await expect(bandLink.getByText("EP", { exact: true })).toBeVisible();
  await bandLink.click();
  // The band settings (#221), from the band menu: the genre, then the logo.
  await leader.getByRole("button", { name: "Band menu" }).click();
  await leader.getByRole("menuitem", { name: "Band settings" }).click();
  await expect(leader.getByRole("heading", { name: "Band settings" })).toBeVisible();
  await leader.getByLabel("Genre").fill("Grunge");
  await leader.getByRole("button", { name: "Save", exact: true }).click();
  await expect(leader.getByText("Band updated")).toBeVisible();
  // On a phone, a toast opens at the bottom, above the band's bottom bar: never over the header's
  // buttons.
  const toast = leader.locator("[data-sonner-toast]").filter({ hasText: "Band updated" });
  const bottomBar = await leader.getByRole("navigation", { name: "Band sections" }).boundingBox();
  await expect
    .poll(async () => {
      const box = await toast.boundingBox();
      return box && box.y + box.height <= (bottomBar?.y ?? 0) && box.y > (bottomBar?.y ?? 0) / 2;
    })
    .toBe(true);
  // The header says it at once.
  await expect(leader.getByText("Grunge", { exact: true })).toBeVisible();
  const dialog = leader.locator("main");
  await expect(dialog.getByText("No logo yet")).toBeVisible();
  await expect(leader.locator("main img")).toHaveCount(0);

  // A horizontal logo with a transparent background: fitted, never cropped.
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(fileURLToPath(new URL("./fixtures/logo.png", import.meta.url)));
  // Shown, not only there: the preview is a blob: image, which the security policy must allow.
  const preview = dialog.getByRole("img", { name: "Preview of the new logo" });
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(900);
  // Shown as it is: no background to choose (#189).
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save the logo" }).click();
  await expect(leader.getByText("Logo saved")).toBeVisible();

  const current = dialog.getByRole("img", { name: "The band's logo" });
  await expect(current).toBeVisible();
  // Served by the API, the whole image: 900 × 300 is under the 2,000 px limit.
  await expect.poll(() => current.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(900);
  const inSettings = await current.boundingBox();
  await leader.getByRole("link", { name: "Home" }).click();

  // On the band's home page, the full logo, at most a third of the screen's height; next to the
  // band's name, its thumbnail; in the band list, its thumbnail too.
  const logo = leader.locator('main img[src*="/logo?v="]');
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(900);
  const height = await logo.evaluate((img) => img.getBoundingClientRect().height / innerHeight);
  expect(height).toBeLessThanOrEqual(1 / 3 + 0.01);
  // The same size in the band settings.
  const onHome = await logo.boundingBox();
  expect(Math.round(inSettings?.width ?? 0)).toBe(Math.round(onHome?.width ?? -1));
  expect(Math.round(inSettings?.height ?? 0)).toBe(Math.round(onHome?.height ?? -1));
  const headerLogo = leader.locator('main img[src*="/logo/thumbnail?v="]');
  await expect
    .poll(() => headerLogo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(256);
  await leader.goto("/");
  const thumbnail = bandLink.locator('img[src*="/logo/thumbnail?v="]');
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(256);
  await expect(bandLink.getByText("EP", { exact: true })).toBeHidden();

  // Saved on the device (#178): offline, the list and the band page show it from there.
  await leader.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => savedCount(leader, "logos")).toBe(1);
  // The band list with its logo is saved too (a delayed write).
  await expect.poll(() => savedCopy(leader)).toContain("/logo/thumbnail?v=");
  await leader.context().setOffline(true);
  await leader.reload();
  await expect(leader.getByText("You're offline")).toBeVisible();
  const fromDevice = (scope: Locator) => scope.locator('img[src^="blob:"]').first();
  await expect
    .poll(() => fromDevice(bandLink).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(900);
  await bandLink.click();
  await expect
    .poll(() =>
      fromDevice(leader.locator("main")).evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(900);
  await leader.context().setOffline(false);
  await leader.goto("/");
  await expect(leader.getByText("You're offline")).toBeHidden();

  await bandLink.click();
  await leader.getByRole("button", { name: "Band menu" }).click();
  await leader.getByRole("menuitem", { name: "Band settings" }).click();
  await dialog.getByRole("button", { name: "Remove the logo" }).click();
  await expect(leader.getByText("Logo removed")).toBeVisible();
  await expect(dialog.getByText("No logo yet")).toBeVisible();
  await leader.getByRole("link", { name: "Home" }).click();
  // Without a logo, nothing on the band's pages (the initials are for the band list), but the
  // band leader's way back to the settings (#222).
  await expect(logo).toHaveCount(0);
  await expect(headerLogo).toHaveCount(0);
  await leader.getByRole("link", { name: "Add your band's logo" }).click();
  await expect(leader.getByRole("heading", { name: "Band settings" })).toBeVisible();
  await leader.getByRole("link", { name: "Home" }).click();

  const journal = leader.getByRole("list", { name: "Latest activity" });
  await expect(journal.getByRole("listitem").first()).toContainText(
    "Lea Leader removed the band's logo",
  );
  await expect(journal).toContainText("Lea Leader changed the band's logo");

  await leader.goto("/");
  await expect(bandLink.getByText("EP", { exact: true })).toBeVisible();
  await bandLink.click();
});

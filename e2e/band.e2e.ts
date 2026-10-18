import { fileURLToPath } from "node:url";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { ADMIN, bandName, email, invitationLink, login, PASSWORD } from "./support";

// One story, in order: each step builds on the previous one.
test.describe.configure({ mode: "serial" });

const band = bandName("Rockers");
const leaderEmail = email("leader");
const musicianEmail = email("musician");
let leader: Page;

/** A separate browser (own cookies) for each person. */
async function person(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

test.afterAll(async () => {
  await leader?.context().close();
});

test("an admin invites a band leader", async ({ page }) => {
  await login(page, ADMIN, PASSWORD);
  await page.goto("/admin");
  await page.getByRole("button", { name: "New band leader" }).click();
  await page.getByLabel("Email", { exact: true }).fill(leaderEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${leaderEmail}`)).toBeVisible();
});

test("the band leader creates an account and the band from the email's link", async ({
  browser,
}) => {
  leader = await person(browser);
  await leader.goto(await invitationLink(leaderEmail));
  await expect(leader.getByText("Step 1 of 4")).toBeVisible();
  await leader.getByLabel("First name").fill("Lea");
  await leader.getByLabel("Last name").fill("Leader");
  // The picker: typing filters the list, with icons; pick from it.
  await leader.getByLabel("Main instrument").fill("Gui");
  await leader.getByRole("option", { name: "Guitar", exact: true }).click();
  await expect(leader.getByLabel("Main instrument")).toHaveValue("Guitar");
  await leader.getByRole("button", { name: "Next" }).click();

  await leader.getByLabel("Band name").fill(band);
  await leader.getByRole("button", { name: "Next" }).click();

  await leader.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await leader.getByLabel("Confirm password").fill(PASSWORD);
  await leader.getByRole("button", { name: "Next" }).click();

  await leader.getByRole("button", { name: "Create my band" }).click();
  await expect(leader).toHaveURL(/\/b\/e2e-rockers-/);
  await expect(leader.getByText(`Welcome to ${band}!`)).toBeVisible();
});

test("the band leader invites a musician, who joins the band", async ({ browser }) => {
  await leader.getByRole("link", { name: "Lineup" }).click();
  await leader.getByRole("button", { name: "Invite a musician" }).click();
  await leader.getByLabel("Email", { exact: true }).fill(musicianEmail);
  await leader.getByRole("button", { name: "Send invitation" }).click();
  await expect(leader.getByText(`Invitation sent to ${musicianEmail}`)).toBeVisible();

  const musician = await person(browser);
  await musician.goto(await invitationLink(musicianEmail));
  await expect(musician.getByText(`Join ${band}`).first()).toBeVisible();
  await musician.getByLabel("First name").fill("Max");
  await musician.getByLabel("Last name").fill("Musician");
  await musician.getByLabel("Nickname").fill("Maxou");
  // Typed without picking: kept, as the known instrument it names.
  await musician.getByLabel("Main instrument").fill("Bass");
  await musician.getByLabel("Main instrument").press("Tab");
  await expect(musician.getByLabel("Main instrument")).toHaveValue("Bass guitar");
  await musician.getByRole("button", { name: "Next" }).click();
  await musician.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await musician.getByLabel("Confirm password").fill(PASSWORD);
  await musician.getByRole("button", { name: "Next" }).click();
  await musician.getByRole("button", { name: "Join the band" }).click();
  await expect(musician.getByText(`Welcome to ${band}!`)).toBeVisible();

  await musician.getByRole("link", { name: "Lineup" }).click();
  const lineup = musician.getByRole("listitem");
  await expect(lineup).toHaveCount(2);
  await expect(lineup.nth(0)).toContainText("Lea Leader");
  await expect(lineup.nth(0)).toContainText("Guitar");
  await expect(lineup.nth(1)).toContainText("Maxou");
  // Typed "Bass" in the wizard: stored and shown as the known instrument.
  await expect(lineup.nth(1)).toContainText("Bass guitar");
  await musician.context().close();
});

test("the band leader updates their profile: the new name shows everywhere", async () => {
  await leader.goto("/account");
  await leader.getByLabel("Nickname").fill("Captain Lea");
  await leader.getByRole("button", { name: "Update" }).click();
  await expect(leader.getByText("Profile updated.")).toBeVisible();
  await expect(leader.getByText(`Captain Lea · ${leaderEmail}`)).toBeVisible();

  await leader.goto("/");
  await leader.getByRole("link", { name: band }).first().click();
  await leader.getByRole("link", { name: "Lineup" }).click();
  await expect(leader.getByRole("listitem").nth(0)).toContainText("Captain Lea");
});

test("the band leader uploads an avatar, then removes it", async () => {
  await leader.goto("/account");
  await leader
    .locator('input[type="file"]')
    .setInputFiles(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url)));
  await expect(leader.getByRole("img", { name: "Preview of your new avatar" })).toBeVisible();
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Avatar updated.")).toBeVisible();

  // The photo is served (from object storage) and shows in the header.
  const photo = leader.locator('header img[src*="/avatar?v="]');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);

  await leader.getByRole("button", { name: "Remove" }).click();
  await expect(leader.getByText("Avatar removed.")).toBeVisible();
  await expect(leader.locator('img[src*="/avatar?v="]')).toHaveCount(0);
});

test("the colour theme switches and is remembered", async () => {
  const html = leader.locator("html");
  await expect(html).toHaveClass(/dark/);
  await leader.getByRole("button", { name: /theme/i }).click();
  await leader.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
  await leader.reload();
  await expect(html).not.toHaveClass(/dark/);
});

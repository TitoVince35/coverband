import { type Browser, expect, type Page, test } from "@playwright/test";
import { ADMIN_APP_URL } from "./playwright.config";
import {
  ADMIN,
  adminAppLogin,
  bandName,
  email,
  invitationLink,
  openAdminRow,
  PASSWORD,
} from "./support";

// Through the screens: a band leader invited from the admin app creates the band, invites a
// musician who joins. Other files set their band up in a few requests (`newBand()`).
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

test("an admin invites a band leader from the admin app (#250)", async ({ page }) => {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${ADMIN_APP_URL}/#/invitations`);
  await page.getByRole("button", { name: "Invite a band leader" }).click();
  await page.getByRole("dialog").getByLabel("Email", { exact: true }).fill(leaderEmail);
  await page.getByRole("dialog").getByLabel("Email's language").selectOption("en");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${leaderEmail}`)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: leaderEmail });
  await expect(row).toContainText("Pending");
  await expect(row).toContainText("E2E Admin");
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
  await expect(leader.getByRole("heading", { name: band })).toBeVisible();
  // No welcome message (#222); no logo yet: the band leader's way to add one.
  await expect(leader.getByText("Welcome to")).toBeHidden();
  await expect(leader.getByRole("link", { name: "Add your band's logo" })).toBeVisible();
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
  // Typed, list closed, step submitted with Enter: the field never loses focus, the text counts.
  await musician.getByLabel("Main instrument").fill("Bass");
  await musician.getByLabel("Main instrument").press("Escape");
  await musician.getByLabel("Main instrument").press("Enter");
  await musician.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await musician.getByLabel("Confirm password").fill(PASSWORD);
  await musician.getByRole("button", { name: "Next" }).click();
  await expect(musician.getByText("Bass guitar")).toBeVisible(); // the review step
  await musician.getByRole("button", { name: "Join the band" }).click();
  await expect(musician.getByRole("heading", { name: band })).toBeVisible();
  // The way to add a logo is the band leader's.
  await expect(musician.getByRole("link", { name: "Add your band's logo" })).toBeHidden();

  await musician.getByRole("link", { name: "Lineup" }).click();
  // The lineup's rows (each row also lists its instruments): the musician first, then the others.
  const lineup = musician.getByRole("list", { name: "Lineup" }).locator(":scope > li");
  await expect(lineup).toHaveCount(2);
  await expect(lineup.nth(0)).toContainText("Maxou");
  // Typed "Bass" in the wizard: stored and shown as the known instrument.
  await expect(lineup.nth(0)).toContainText("Bass guitar");
  await expect(lineup.nth(1)).toContainText("Lea Leader");
  await expect(lineup.nth(1)).toContainText("Guitar");
  // The band settings are the band leader's (#221): disabled in the menu, and their page sends
  // a musician back to the band's home.
  await musician.getByRole("button", { name: "Band menu" }).click();
  await expect(musician.getByRole("menuitem", { name: "Band settings" })).toBeDisabled();
  await musician.keyboard.press("Escape");
  await musician.goto(musician.url().replace(/\/lineup$/, "/settings"));
  await expect(musician).toHaveURL(/\/b\/e2e-rockers-[^/]+$/);
  await musician.context().close();
});

test("an admin finds the band in the admin app and opens its page (#247)", async ({ page }) => {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${ADMIN_APP_URL}/#/bands`);
  await page.getByPlaceholder("Search by name").fill(band);
  // The search is debounced: once the list shows only this band, open it.
  await expect(page.getByText("1-1 of 1")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: band });
  await expect(row).toContainText("Lea Leader");
  await expect(row).toContainText("2");
  await openAdminRow(page, band);

  await expect(page.getByRole("heading", { name: band })).toBeVisible();
  await expect(page.getByText("band leader")).toBeVisible();
  await expect(page.getByText("Maxou", { exact: true })).toBeVisible();
  await expect(page.getByText("Maxou joined the band")).toBeVisible();
  await expect(page.getByText("Bass guitar")).toBeVisible();
  await expect(page.getByText("Lea Leader created the band")).toBeVisible();
  await expect(page.getByRole("img", { name: /0% used: 0 bytes of 500 MB/ })).toBeVisible();
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
  await expect(
    leader.getByRole("list", { name: "Lineup" }).locator(":scope > li").nth(0),
  ).toContainText("Captain Lea");
});

test("a member edits their own instruments from the lineup", async () => {
  await leader.goto("/");
  await leader.getByRole("link", { name: band }).first().click();
  await leader.getByRole("link", { name: "Lineup" }).click();
  // Only on your own row.
  await expect(leader.getByRole("button", { name: "Edit my instruments" })).toHaveCount(1);
  await leader.getByRole("button", { name: "Edit my instruments" }).click();
  const dialog = leader.getByRole("dialog");
  await expect(dialog.getByText("Guitar")).toBeVisible();
  await expect(dialog.getByText("main", { exact: true })).toBeVisible();

  // Typed in French, picked with Enter: the known instrument.
  const add = dialog.getByLabel("Add an instrument");
  await add.fill("chant");
  await add.press("Enter");
  await expect(dialog.getByText("Vocals")).toBeVisible();
  // Something not in the catalogue: kept as typed.
  await dialog.getByLabel("Add an instrument").fill("Kazoo");
  await leader.getByRole("option", { name: "Add “Kazoo”" }).click();
  // Already listed: Enter doesn't add it twice. The field keeps the focus after each addition.
  await expect(dialog.getByLabel("Add an instrument")).toBeFocused();
  await dialog.getByLabel("Add an instrument").fill("kazoo");
  await dialog.getByLabel("Add an instrument").press("Enter");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Kazoo" })).toHaveCount(1);
  // The focused field doesn't open its list over the dialog's buttons by itself.
  await expect(leader.getByRole("listbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Remove Guitar" }).click();
  // Typed but not added: Save keeps it too.
  await dialog.getByLabel("Add an instrument").fill("Ukulele");
  await dialog.getByLabel("Add an instrument").press("Escape"); // closes the list, not the dialog
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Instruments updated")).toBeVisible();

  const row = leader.getByRole("list", { name: "Lineup" }).locator(":scope > li").nth(0);
  await expect(row).toContainText("Vocals");
  await expect(row).toContainText("Kazoo");
  await expect(row).toContainText("Ukulele");
  await expect(row).not.toContainText("Guitar");
});

test("the band's home page shows its latest activity, newest first", async () => {
  await leader.goto("/");
  await leader.getByRole("link", { name: band }).first().click();
  // Shown at once, its height fixed (#285).
  const journal = leader.getByRole("list", { name: "Latest activity" });
  await expect(journal).toBeVisible();
  const entries = journal.getByRole("listitem");
  // Names as they are now (Lea took a nickname since).
  await expect(entries.first()).toContainText("Captain Lea updated their instruments");
  await expect(journal).toContainText("Maxou joined the band");
  await expect(journal).toContainText("Captain Lea invited a musician");
  await expect(entries.last()).toContainText("Captain Lea created the band");
  // Today: the time alone, no day's name.
  await expect(entries.first()).toContainText(/^\d{1,2}:\d{2}\s?[AP]M · /);
  await expect(entries.first()).not.toContainText("Today");
  // Never an email.
  await expect(journal).not.toContainText("@");
});

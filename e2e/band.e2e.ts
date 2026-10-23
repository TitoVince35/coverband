import { fileURLToPath } from "node:url";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
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
  await expect(leader.getByRole("heading", { name: band })).toBeVisible();
  // No welcome message (#222); no logo yet: the band leader's way to add one.
  await expect(leader.getByText("Welcome to")).toBeHidden();
  await expect(leader.getByRole("link", { name: "Add your band's logo" })).toBeVisible();
});

test("an admin views the app as the band leader, read-only, then stops", async ({ page }) => {
  await login(page, ADMIN, PASSWORD);
  await page.goto("/admin");
  await page
    .getByRole("listitem")
    .filter({ hasText: leaderEmail })
    .getByRole("button", { name: "View as" })
    .click();
  await expect(page.getByText("Viewing the app as Lea Leader: read-only.")).toBeVisible();
  await expect(page.getByRole("link", { name: band })).toBeVisible();

  await page.goto("/account");
  await page.getByLabel("Nickname").fill("Hacked");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Read-only while viewing the app as another user.")).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Viewing the app as")).toBeHidden();
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

test("the band's sections: a bottom bar on a phone, tabs on a large screen (#223)", async () => {
  await leader.goto("/");
  await leader.getByRole("link", { name: band }).first().click();
  const sections = leader.getByRole("navigation", { name: "Band sections" });
  // Five items: Setlists and Gigs there already, not links yet.
  await expect(sections.getByRole("link")).toHaveCount(3);
  await expect(sections.getByText("Setlists")).toBeVisible();
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
  await expect(sections.getByRole("link")).toHaveCount(3);
  await leader.setViewportSize(phone);
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
  // The journal is a closed accordion.
  const journal = leader.getByRole("list", { name: "Latest activity" });
  await expect(leader.getByRole("button", { name: "Latest activity" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(journal).toBeHidden();
  await leader.getByRole("button", { name: "Latest activity" }).click();
  const entries = journal.getByRole("listitem");
  // Names as they are now (Lea took a nickname since).
  await expect(entries.first()).toContainText("Captain Lea updated their instruments");
  await expect(journal).toContainText("Maxou joined the band");
  await expect(journal).toContainText("Captain Lea invited a musician");
  await expect(entries.last()).toContainText("Captain Lea created the band");
  await expect(entries.first()).toContainText("Today");
  // Never an email.
  await expect(journal).not.toContainText("@");
});

test("while data loads, a skeleton shows, never a blank page (#190)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // A slow connection: the band list takes a while.
  await page.route("**/api/bands", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await login(page, leaderEmail, PASSWORD);
  await expect(page.getByRole("status", { name: "Loading…" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(band) })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading…" })).toHaveCount(0);
  await context.close();
});

test("the band leader adds the band's logo: on the band page and in the list, then removed", async () => {
  await leader.goto("/");
  // No logo yet: the band's initials ("E2E Rockers …").
  const bandLink = leader.getByRole("link", { name: band }).first();
  await expect(bandLink.getByText("ER", { exact: true })).toBeVisible();
  await bandLink.click();
  // The band settings (#221), from the band menu: the genre, then the logo.
  await leader.getByRole("button", { name: "Band menu" }).click();
  await leader.getByRole("menuitem", { name: "Band settings" }).click();
  await expect(leader.getByRole("heading", { name: "Band settings" })).toBeVisible();
  await leader.getByLabel("Genre").fill("Grunge");
  await leader.getByRole("button", { name: "Save", exact: true }).click();
  await expect(leader.getByText("Band updated")).toBeVisible();
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
  await expect(bandLink.getByText("ER", { exact: true })).toBeHidden();

  // Saved on the device (#178): offline, the list and the band page show it from there.
  await leader.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => savedLogos(leader)).toBe(1);
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

  await leader.getByRole("button", { name: "Latest activity" }).click();
  const journal = leader.getByRole("list", { name: "Latest activity" });
  await expect(journal.getByRole("listitem").first()).toContainText(
    "Captain Lea removed the band's logo",
  );
  await expect(journal).toContainText("Captain Lea changed the band's logo");
  await leader.getByRole("button", { name: "Latest activity" }).click();

  await leader.goto("/");
  await expect(bandLink.getByText("ER", { exact: true })).toBeVisible();
  await bandLink.click();
});

test("members build the repertoire: add, the duplicate warning, edit", async () => {
  await leader.getByRole("link", { name: "Repertoire" }).click();
  await expect(leader.getByText("No songs yet")).toBeVisible();
  const add = async (title: string, artist: string) => {
    await leader.getByRole("button", { name: "Add a song" }).click();
    const dialog = leader.getByRole("dialog");
    await dialog.getByLabel("Title", { exact: true }).fill(title);
    await dialog.getByLabel("Artist", { exact: true }).fill(artist);
    await dialog.getByRole("button", { name: "Save only" }).click();
    return dialog;
  };
  const songs = leader.getByRole("list", { name: "Repertoire" }).getByRole("listitem");
  const backToRepertoire = () => leader.getByRole("link", { name: "Repertoire" }).first().click();

  // The title and the artist only, then the new song's page, to fill in the rest.
  await leader.getByRole("button", { name: "Add a song" }).click();
  await expect(leader.getByRole("dialog").getByLabel("Artist", { exact: true })).toBeVisible();
  await expect(leader.getByRole("dialog").getByLabel("Tempo (BPM)")).toHaveCount(0);
  await leader.keyboard.press("Escape");
  await add("Creep", "Radiohead");
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  await expect(leader.getByRole("heading", { name: "Creep" })).toBeVisible();
  await backToRepertoire();
  await expect(songs).toHaveCount(1);

  // The same song, typed differently: a warning, then added if confirmed.
  const dialog = await add("creep", "RADIOHEAD");
  await expect(dialog.getByText("Already in your repertoire: Creep – Radiohead.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save anyway" }).click();
  await expect(leader.getByRole("heading", { name: "creep" })).toBeVisible();
  await backToRepertoire();
  await expect(songs).toHaveCount(2);

  // "Search and add": Deezer's details and YouTube's videos (both fakes), the album track first.
  await leader.getByRole("button", { name: "Add a song" }).click();
  const lucky = leader.getByRole("dialog");
  await lucky.getByLabel("Title", { exact: true }).fill("Zombie");
  await lucky.getByLabel("Artist", { exact: true }).fill("The Cranberries");
  await lucky.getByRole("button", { name: "Search and add" }).click();
  await expect(lucky.getByText("Found on Deezer")).toBeVisible();
  await expect(lucky.getByText("No Need to Argue · 5:07 · Rock")).toBeVisible();
  const proposals = lucky.getByRole("group", { name: "Choose a YouTube video" });
  // Three videos and "No video"; the album track of the "Topic" channel first, and chosen.
  await expect(proposals.getByRole("radio")).toHaveCount(4);
  await expect(proposals.locator("label").first()).toContainText("The Cranberries - Topic");
  await expect(proposals.getByRole("radio").first()).toBeChecked();
  await expect(proposals.locator("label").nth(2)).toContainText("Live at Woodstock");
  // The thumbnails come through the API, drawn.
  const thumbnail = proposals.locator('img[src*="/autofill/thumbnails/"]').first();
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(320);
  await lucky.getByRole("button", { name: "Add", exact: true }).click();
  await expect(leader.getByRole("heading", { name: "Zombie" })).toBeVisible();
  // Its first link: the chosen video, never the Deezer track (#219).
  const firstLinks = leader.getByRole("list", { name: "Links" }).locator(":scope > li");
  await expect(firstLinks).toHaveCount(1);
  await expect(firstLinks.first()).toContainText("YouTube");
  await backToRepertoire();
  await expect(songs).toHaveCount(3);
  await leader.getByRole("searchbox").fill("cranberries");
  await expect(songs).toHaveCount(1);
  await songs.first().click();

  await expect(leader.getByRole("heading", { name: "Zombie" })).toBeVisible();
  // Details: an accordion, closed at first.
  await expect(leader.getByRole("button", { name: "Edit the details" })).toBeHidden();
  await leader.getByRole("button", { name: "Details", exact: true }).click();
  // Filled in from Deezer: its duration and genre.
  await expect(leader.getByText("5:07")).toBeVisible();
  await expect(leader.getByText("Rock", { exact: true })).toBeVisible();
  await leader.getByRole("button", { name: "Edit the details" }).click();
  const edit = leader.getByRole("dialog");
  await expect(edit.getByLabel("Title", { exact: true })).toHaveCount(0);
  await edit.getByLabel("Original duration").fill("5:06");
  await edit.getByLabel("Key", { exact: true }).click();
  await leader.getByRole("option", { name: "E minor" }).click();
  await edit.getByLabel("Tempo (BPM)").fill("84");
  await edit.getByLabel("Style").fill("Alternative rock");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Song updated")).toBeVisible();
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  for (const text of ["5:06", "E minor", "84 BPM", "Alternative rock"]) {
    await expect(leader.getByText(text)).toBeVisible();
  }
  // Closed again, then open.
  await leader.getByRole("button", { name: "Details", exact: true }).click();
  await expect(leader.getByText("84 BPM")).toBeHidden();
  await expect(leader.getByRole("button", { name: "Edit the details" })).toBeHidden();
  await leader.getByRole("button", { name: "Details", exact: true }).click();
  await expect(leader.getByText("84 BPM")).toBeVisible();
  // The top pencil edits the title and artist only.
  await leader.getByRole("button", { name: "Edit the song" }).click();
  const main = leader.getByRole("dialog");
  await expect(main.getByLabel("Artist", { exact: true })).toHaveValue("The Cranberries");
  await expect(main.getByLabel("Tempo (BPM)")).toHaveCount(0);
  await leader.keyboard.press("Escape");
  await expect(leader.getByRole("dialog")).toHaveCount(0);

  // The notes, edited in place: Save once they change, a warning before leaving them unsaved.
  const notes = leader.getByRole("textbox", { name: "Notes" });
  const saveNotes = leader.getByRole("button", { name: "Save", exact: true });
  await expect(saveNotes).toBeDisabled();
  await notes.fill("Big intro, everyone in at bar 5");
  await leader.getByRole("link", { name: "Repertoire" }).first().click();
  await expect(leader.getByText("Leave without saving the notes?")).toBeVisible();
  await leader.getByRole("button", { name: "Stay" }).click();
  await expect(notes).toHaveValue("Big intro, everyone in at bar 5");
  await saveNotes.click();
  await expect(leader.getByText("Notes saved")).toBeVisible();
  await expect(saveNotes).toBeDisabled();

  // The lyrics: closed on a phone. Searched online (a fake LRCLIB), the version closest to the
  // original duration first; previewed, then used.
  await leader.getByText("Lyrics", { exact: true }).click();
  await expect(leader.getByText("No lyrics yet.")).toBeVisible();
  await leader.getByRole("button", { name: "Search lyrics online" }).click();
  const found = leader.getByRole("list", { name: "Lyrics found" }).getByRole("button");
  await expect(found).toHaveCount(2);
  await expect(found.first()).toContainText("No Need to Argue · 5:06");
  await found.first().click();
  await expect(leader.getByRole("dialog")).toContainText("Child is slowly taken");
  await leader.getByRole("button", { name: "Use these lyrics" }).click();
  await expect(leader.getByText("Lyrics saved")).toBeVisible();
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  await expect(leader.getByText("Lyrics from LRCLIB")).toBeVisible();

  // From the editor, "Replace from online" asks first when there are changes, then searches.
  await leader.getByRole("button", { name: "Edit", exact: true }).click();
  await leader.getByRole("dialog").getByRole("textbox", { name: "Lyrics" }).fill("Typo");
  await leader.getByRole("button", { name: "Replace from online" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Close" }).click();
  await expect(leader.getByRole("list", { name: "Lyrics found" })).toBeVisible();
  await leader.keyboard.press("Escape");
  await expect(leader.getByRole("dialog")).toHaveCount(0);

  // Edited in a modal that asks before closing with changes.
  await leader.getByRole("button", { name: "Edit", exact: true }).click();
  const lyrics = leader.getByRole("dialog");
  await lyrics
    .getByRole("textbox", { name: "Lyrics" })
    .fill("Another head hangs lowly\nChild is slowly taken\nAnd the violence caused such silence");
  await leader.keyboard.press("Escape");
  await expect(leader.getByText("Close without saving the lyrics?")).toBeVisible();
  await leader.getByRole("button", { name: "Keep editing" }).click();
  await lyrics.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Lyrics saved").first()).toBeVisible();
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  await expect(leader.getByText("And the violence caused such silence")).toBeVisible();
  // Still credited: fetched, then fixed.
  await expect(leader.getByText("Lyrics from LRCLIB")).toBeVisible();

  // Full screen for the stage: a larger text, remembered on the device.
  await leader.getByRole("button", { name: "View", exact: true }).click();
  const view = leader.getByRole("dialog", { name: "Zombie" });
  const text = view.getByText("And the violence caused such silence");
  await expect(text).toHaveCSS("font-size", "26px");
  await view.getByRole("button", { name: "Larger text" }).click();
  await expect(text).toHaveCSS("font-size", "32px");
  await view.getByRole("button", { name: "Close" }).click();
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  await leader.getByRole("button", { name: "View", exact: true }).click();
  await expect(text).toHaveCSS("font-size", "32px");
  await leader.keyboard.press("Escape");
  await expect(leader.getByRole("dialog")).toHaveCount(0);

  // A link, for the drummer: the provider shows, it opens in a new tab.
  await leader.getByRole("button", { name: "Add a link" }).click();
  const link = leader.getByRole("dialog");
  await link.getByLabel("Web address").fill("https://www.youtube.com/watch?v=6Ejga4kJUts");
  await link.getByLabel("Title", { exact: true }).fill("Drum cover");
  await link.getByLabel("Add an instrument").fill("batterie");
  await link.getByLabel("Add an instrument").press("Enter");
  await expect(link.getByText("Drums", { exact: true })).toBeVisible();
  // Typed, list closed, Enter: added, and the link form stays open.
  await link.getByLabel("Add an instrument").fill("Cowbell");
  await link.getByLabel("Add an instrument").press("Escape");
  await link.getByLabel("Add an instrument").press("Enter");
  await expect(link.getByText("Cowbell", { exact: true })).toBeVisible();
  await expect(leader.getByRole("dialog")).toHaveCount(1);
  await link.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Link added")).toBeVisible();
  const links = leader.getByRole("list", { name: "Links" }).locator(":scope > li");
  // After the video from "Search and add", oldest first.
  await expect(links).toHaveCount(2);
  await expect(links.last()).toContainText("Drum cover");
  await expect(links.last()).toContainText("YouTube");
  await expect(links.last()).toContainText("Drums");
  await expect(links.last()).toContainText("Cowbell");
  await expect(links.last().getByRole("link")).toHaveAttribute("target", "_blank");

  // A link found on Deezer (#220): the song searched at once, the chosen track fills the form in.
  await leader.getByRole("button", { name: "Add a link" }).click();
  await leader.getByRole("button", { name: "Search on Deezer" }).click();
  await expect(leader.getByRole("textbox", { name: "Search for" })).toHaveValue(
    "Zombie The Cranberries",
  );
  const tracks = leader.getByRole("list", { name: "Tracks found" });
  await tracks.getByRole("button", { name: /Zombie/ }).click();
  await expect(link.getByLabel("Web address")).toHaveValue("https://www.deezer.com/track/2");
  await expect(link.getByLabel("Title", { exact: true })).toHaveValue("Zombie");
  await link.getByRole("button", { name: "Save" }).click();
  await expect(links).toHaveCount(3);
  await expect(links.last()).toContainText("Deezer");

  // Documents (#239): a closed accordion after the links, the one block open at first.
  await expect(leader.getByRole("button", { name: "Links" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const documentsBlock = leader.getByRole("button", { name: "Documents" });
  await expect(documentsBlock).toHaveAttribute("aria-expanded", "false");
  await documentsBlock.click();
  const documents = leader.getByRole("list", { name: "Documents" }).locator(":scope > li");
  const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

  // A photo of the chord grid: made smaller before it's sent.
  await leader.getByRole("button", { name: "Add a document" }).click();
  const doc = leader.getByRole("dialog");
  await doc.getByLabel("File").setInputFiles(fixture("photo.jpg"));
  await expect(doc.getByText(/^Ready: /)).toBeVisible();
  await expect(doc.getByLabel("Title", { exact: true })).toHaveValue("photo");
  await doc.getByLabel("Title", { exact: true }).fill("Chords");
  await doc.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Document added")).toBeVisible();
  await expect(documents).toHaveCount(1);
  await expect(documents.first()).toContainText("Chords");
  await expect(documents.first()).toContainText("Photo · added by Captain Lea");
  const photoLink = documents.first().getByRole("link");
  await expect(photoLink).toHaveAttribute("target", "_blank");
  const photo = await leader.request.get((await photoLink.getAttribute("href")) ?? "");
  expect(photo.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);
  expect((await photo.body()).length).toBeLessThan(600_000);

  // The horns' part as a PDF, for the trumpet: a progress bar while it's sent.
  await leader.getByRole("button", { name: "Add a document" }).click();
  await doc.getByLabel("File").setInputFiles(fixture("horns.pdf"));
  await expect(doc.getByLabel("Title", { exact: true })).toHaveValue("horns");
  await doc.getByLabel("Title", { exact: true }).fill("Horns");
  await doc.getByLabel("Add an instrument").fill("Trumpet");
  await doc.getByLabel("Add an instrument").press("Enter");
  await doc.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Document added")).toBeVisible();
  await expect(documents).toHaveCount(2);
  await expect(documents.last()).toContainText("Horns");
  await expect(documents.last()).toContainText("PDF");
  await expect(documents.last()).toContainText("Trumpet");
  const pdf = await leader.request.get(
    (await documents.last().getByRole("link").getAttribute("href")) ?? "",
  );
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // Edited, then deleted (with a confirmation), by the band leader.
  await leader.getByRole("button", { name: "Edit the document Horns" }).click();
  await doc.getByLabel("Title", { exact: true }).fill("Horns part");
  await doc.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Document updated")).toBeVisible();
  await expect(documents.last()).toContainText("Horns part");
  for (const title of ["Horns part", "Chords"]) {
    await leader.getByRole("button", { name: `Edit the document ${title}` }).click();
    await doc.getByRole("button", { name: "Delete" }).click();
    await leader.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(leader.getByText("Document removed").first()).toBeVisible();
  }
  await expect(leader.getByText("No documents yet")).toBeVisible();

  // Status and energy: one tap each, saved at once.
  await expect(leader.getByRole("radio", { name: "Proposed" })).toBeChecked();
  await leader.getByRole("radio", { name: "Learning" }).click();
  await expect(leader.getByRole("radio", { name: "Learning" })).toBeChecked();
  // With the keyboard: arrows move the status, and the focus stays while each one is saved.
  const statuses = leader.getByRole("group", { name: "Status" });
  await expect(statuses).toHaveAttribute("aria-busy", "false");
  await leader.keyboard.press("ArrowRight");
  await expect(leader.getByRole("radio", { name: "Ready" })).toBeChecked();
  await expect(leader.getByRole("radio", { name: "Ready" })).toBeFocused();
  await expect(statuses).toHaveAttribute("aria-busy", "false");
  await leader.keyboard.press("ArrowLeft");
  await expect(leader.getByRole("radio", { name: "Learning" })).toBeChecked();
  await expect(statuses).toHaveAttribute("aria-busy", "false");
  await leader.getByRole("button", { name: "Rate energy 3 of 3" }).click();
  await expect(leader.getByText("Energy 3 of 3")).toBeVisible();
  await leader.getByRole("link", { name: "Repertoire" }).first().click();
  await leader.getByRole("button", { name: /^Learning/ }).click();
  await expect(songs).toHaveCount(1);
  await expect(songs.first()).toContainText("Zombie");
  await expect(songs.first().getByRole("img", { name: "Energy 3 of 3" })).toBeVisible();
  // Reversed (#218): the same songs, the other way round.
  await leader.getByRole("button", { name: /^All/ }).click();
  const byTitle = await songs.allInnerTexts();
  await leader.getByRole("button", { name: "Ascending" }).click();
  await expect(leader.getByRole("button", { name: "Descending" })).toBeVisible();
  expect(await songs.allInnerTexts()).toEqual(byTitle.toReversed());

  // The journal names the songs.
  await leader.getByRole("link", { name: "Home" }).click();
  // The journal is a closed accordion.
  await leader.getByRole("button", { name: "Latest activity" }).click();
  const journal = leader.getByRole("list", { name: "Latest activity" });
  await expect(journal.getByRole("listitem").first()).toContainText(
    "Captain Lea updated song “Zombie”",
  );
  // (Its 10 latest events: the lyrics and "added song" are older, behind the documents.)
  await expect(journal).toContainText("Captain Lea added a document to song “Zombie”");
  await expect(journal).toContainText("Captain Lea removed a document from song “Zombie”");
  await expect(journal).toContainText("Captain Lea marked song “Zombie” as learning");

  // Archive a song, find it apart, restore it; the band leader deletes the copy for good.
  await leader.getByRole("link", { name: "Repertoire" }).click();
  await songs
    .filter({ hasText: /Creep/ })
    .filter({ hasText: /Radiohead/ })
    .click();
  // LRCLIB only knows it as an instrumental: said so, with a web search to look further.
  await leader.getByText("Lyrics", { exact: true }).click();
  await leader.getByRole("button", { name: "Search lyrics online" }).click();
  await expect(leader.getByText("LRCLIB lists this song as an instrumental.")).toBeVisible();
  await expect(leader.getByRole("link", { name: "Search the web" })).toHaveAttribute(
    "href",
    `https://www.google.com/search?q=${encodeURIComponent('"Creep" Radiohead lyrics')}`,
  );
  // A free search, refined from the song's title and artist, finds a sung version.
  await expect(leader.getByRole("textbox", { name: "Search for" })).toHaveValue("Creep Radiohead");
  await leader.getByRole("textbox", { name: "Search for" }).fill("Creep acoustic");
  await leader.getByRole("button", { name: "Search again" }).click();
  await expect(leader.getByRole("list", { name: "Lyrics found" })).toContainText(
    "Radiohead – Creep (Acoustic)",
  );
  await leader.keyboard.press("Escape");
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  await leader.getByRole("button", { name: "Archive" }).click();
  await expect(leader.getByText("This song is archived")).toBeVisible();
  await leader.getByRole("link", { name: "Repertoire" }).first().click();
  await expect(songs).toHaveCount(2);
  await leader.getByRole("link", { name: /Archived songs/ }).click();
  await leader.getByRole("list", { name: "Archived songs" }).getByRole("link").click();
  await leader.getByRole("button", { name: "Restore" }).click();
  await expect(leader.getByText("This song is archived")).toHaveCount(0);

  await leader.getByRole("link", { name: "Repertoire" }).first().click();
  await expect(songs).toHaveCount(3);
  await songs.filter({ hasText: /RADIOHEAD/ }).click();
  await leader.getByRole("button", { name: "Delete" }).click();
  await leader.getByRole("button", { name: "Delete for good" }).click();
  await expect(leader.getByText("Song deleted")).toBeVisible();
  await expect(songs).toHaveCount(2);
});

/** How many band logos the app saved on the device for offline use (#178). */
function savedLogos(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("coverband");
        // Never create the app's database before the app does.
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("logos")) return resolve(0);
          const count = db.transaction("logos").objectStore("logos").count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(0);
        };
        open.onerror = () => resolve(0);
      }),
  );
}

/** The data the app saved on the device for offline use (#165), as JSON, or "" before any. */
function savedCopy(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open("coverband");
        // Never create the app's database before the app does.
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("query-cache")) return resolve("");
          const get = db.transaction("query-cache").objectStore("query-cache").get("client");
          get.onsuccess = () => resolve(JSON.stringify(get.result ?? ""));
          get.onerror = () => resolve("");
        };
        open.onerror = () => resolve("");
      }),
  );
}

const lyricsLine = "And the violence caused such silence";

test("offline: the saved bands, repertoire and lyrics, read-only (#165)", async ({ browser }) => {
  // A device that never opened the song: the home page saves every band for offline use.
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, leaderEmail, PASSWORD);
  await expect(page.getByRole("link", { name: new RegExp(band) })).toBeVisible();
  // The service worker serves the app itself without a connection.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => savedCopy(page)).toContain(lyricsLine);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("You're offline")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(band) }).click();
  await page.getByRole("link", { name: "Repertoire" }).click();
  await page
    .getByRole("list", { name: "Repertoire" })
    .getByRole("listitem")
    .filter({ hasText: "Zombie" })
    .click();
  await page.getByText("Lyrics", { exact: true }).click();
  await expect(page.getByText(lyricsLine)).toBeVisible();
  // Read-only: no change can start.
  const edit = page.getByRole("button", { name: "Edit the song" });
  await expect(edit).toBeDisabled();
  await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();

  await context.setOffline(false);
  await expect(page.getByText("You're offline")).toBeHidden();
  await expect(edit).toBeEnabled();
  await context.close();
});

test("logging out and in again saves everything again (#174)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, leaderEmail, PASSWORD);
  await expect.poll(() => savedCopy(page)).toContain(lyricsLine);

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => savedCopy(page)).not.toContain(lyricsLine);

  // At once, without reloading the app (logging out doesn't): the repertoire is loaded again.
  await page.getByLabel("Email").fill(leaderEmail);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("link", { name: new RegExp(band) })).toBeVisible();
  await expect.poll(() => savedCopy(page)).toContain(lyricsLine);
  await context.close();
});

test("the band leader uploads an avatar, then removes it", async () => {
  await leader.goto("/account");
  await leader
    .locator('input[type="file"]')
    .setInputFiles(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url)));
  // Shown, not only there: the preview is a blob: image, which the security policy must allow.
  const preview = leader.getByRole("img", { name: "Preview of your new avatar" });
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
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

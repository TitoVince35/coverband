import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { BASE_URL } from "./playwright.config";
import {
  addSetlist,
  addSong,
  type Band,
  login,
  newBand,
  PASSWORD,
  savedCopy,
  savedCount,
} from "./support";

// Offline (#165): what the app saved on the device, read-only. Logging out forgets it (#174).
test.describe.configure({ mode: "serial" });

let band: Band;
const lyricsLine = "And the violence caused such silence";
test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Offline");
  const zombie = await addSong(band, {
    title: "Zombie",
    artist: "The Cranberries",
    lyrics: `Another head hangs lowly\nChild is slowly taken\n${lyricsLine}`,
  });
  // The chord grid's photo (#240).
  const photo = await band.leader.request.post(
    `/api/bands/${band.slug}/songs/${zombie}/documents`,
    {
      headers: { origin: BASE_URL },
      multipart: {
        file: {
          name: "photo.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url))),
        },
        title: "Chords",
      },
    },
  );
  expect(photo.ok()).toBe(true);
  const africa = await addSong(band, { title: "Africa", artist: "Toto" });
  const blackHoleSun = await addSong(band, { title: "Black Hole Sun", artist: "Soundgarden" });
  await addSetlist(band, "Wedding", [
    { songs: [africa] },
    { name: "Encore", songs: [blackHoleSun] },
  ]);
  await band.leader.context().close();
});

test("offline: the saved bands, repertoire and lyrics, read-only (#165)", async ({ browser }) => {
  // Every band tab, twice over (#281).
  test.slow();
  // A device that never opened the song: the home page saves every band for offline use.
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, band.leaderEmail, PASSWORD);
  await expect(page.getByRole("link", { name: new RegExp(band.name) })).toBeVisible();
  // The service worker serves the app itself without a connection.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => savedCopy(page)).toContain(lyricsLine);
  await expect.poll(() => savedCount(page, "documents")).toBe(1);
  // The setlists too, with their songs, though this device never opened them (#274).
  await expect.poll(() => savedCopy(page)).toContain("Wedding");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("You're offline")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(band.name) }).click();
  await page.getByRole("link", { name: "Repertoire" }).click();
  await page
    .getByRole("list", { name: "Repertoire" })
    .getByRole("listitem")
    .filter({ hasText: "Zombie" })
    .click();
  await page.getByText("Lyrics", { exact: true }).click();
  await expect(page.getByText(lyricsLine)).toBeVisible();
  // Its history was never loaded on this device: it says so (#286).
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("The history of this song isn't saved on this device")).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  // Read-only: no change can start.
  const edit = page.getByRole("button", { name: "Edit the song" });
  await expect(edit).toBeDisabled();
  await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();
  // The chord grid's photo, from the device (#240).
  await page.getByRole("button", { name: "Documents" }).click();
  const [photo] = await Promise.all([
    page.waitForEvent("popup"),
    page
      .getByRole("list", { name: "Documents" })
      .getByRole("button", { name: /^Chords/ })
      .click(),
  ]);
  await expect.poll(() => photo.url()).toMatch(/^blob:/);
  await photo.close();
  // Opening it leaves the browser believing it's online, the server still out of reach (#281):
  // like a venue's Wi-Fi. Every band tab opens anyway, with its saved data.
  await openEveryBandTab(page, "Zombie");

  await context.setOffline(false);
  await expect(page.getByText("You're offline")).toBeHidden();
  await expect(edit).toBeEnabled();
  // Deleted: its file goes from the bucket, and from the device.
  await page.getByRole("button", { name: "Documents" }).click();
  await page.getByRole("button", { name: "Edit the document Chords" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Document removed")).toBeVisible();
  await page.reload();
  await expect.poll(() => savedCount(page, "documents")).toBe(0);

  // A setlist never opened on this device, offline and read-only (#274).
  const setlistsPage = `${new URL(page.url()).pathname.split("/").slice(0, 3).join("/")}/setlists`;
  await context.setOffline(true);
  await page.goto(setlistsPage);
  await expect(page.getByText("You're offline")).toBeVisible();
  await expect(page.getByRole("button", { name: "New setlist" })).toBeDisabled();
  await page
    .getByRole("list", { name: "Setlists" })
    .getByRole("link", { name: /Wedding/ })
    .click();
  await expect(page.getByRole("region", { name: "Part 1" })).toContainText("Africa");
  await expect(page.getByRole("region", { name: "Encore" })).toContainText("Black Hole Sun");
  await expect(page.getByRole("button", { name: "Add songs" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Drag / })).toHaveCount(0);
  // Offline for the browser too: every band tab opens, from a song's page and the band's home (#281).
  await openSong(page, "Zombie");
  await openEveryBandTab(page, "Zombie");
  await context.close();
});

/** Opens a song of the band shown from its repertoire, through the band's tabs. */
async function openSong(page: Page, title: string) {
  await page
    .getByRole("navigation", { name: "Band sections" })
    .getByRole("link", { name: "Repertoire" })
    .click();
  await page
    .getByRole("list", { name: "Repertoire" })
    .getByRole("listitem")
    .filter({ hasText: title })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/**
 * Opens each band tab from this song's page, shown, then each again from the band's home (#281):
 * each shows its saved data, never the router's error. Ends back on the song's page.
 */
async function openEveryBandTab(page: Page, song: string) {
  const sections = page.getByRole("navigation", { name: "Band sections" });
  // What each tab shows: the band's home, its journal; the others, their list.
  const tabs = [
    ["Home", page.getByRole("list", { name: "Latest activity" })],
    ["Repertoire", page.getByRole("list", { name: "Repertoire" })],
    ["Lineup", page.getByRole("list", { name: "Lineup" })],
    ["Setlists", page.getByRole("list", { name: "Setlists" })],
  ] as const;
  const from = page.url();
  for (const start of [from, "home"]) {
    for (const [tab, shown] of tabs) {
      if (start === "home") {
        await sections.getByRole("link", { name: "Home" }).click();
        await expect(tabs[0][1]).toBeVisible();
      } else {
        await expect(page).toHaveURL(start);
      }
      await sections.getByRole("link", { name: tab }).click();
      await expect(shown).toBeVisible();
      await expect(page.getByText("Can't reach the server")).toHaveCount(0);
      if (start !== "home") await page.goBack();
    }
  }
  await openSong(page, song);
  await expect(page).toHaveURL(from);
}

test("logging out and in again saves everything again (#174)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, band.leaderEmail, PASSWORD);
  await expect.poll(() => savedCopy(page)).toContain(lyricsLine);

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => savedCopy(page)).not.toContain(lyricsLine);

  // At once, without reloading the app (logging out doesn't): the repertoire is loaded again.
  await page.getByLabel("Email").fill(band.leaderEmail);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("link", { name: new RegExp(band.name) })).toBeVisible();
  await expect.poll(() => savedCopy(page)).toContain(lyricsLine);
  await context.close();
});

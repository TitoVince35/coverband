import { expect, type Page, test } from "@playwright/test";
import { addSong, type Band, newBand } from "./support";

// A song's lyrics: searched online (a fake LRCLIB), edited, viewed full screen for the stage.
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Lyrics");
  leader = band.leader;
  // Its original duration chooses the closest version first.
  await addSong(band, { title: "Zombie", artist: "The Cranberries", standardDuration: 306 });
  await addSong(band, { title: "Creep", artist: "Radiohead" });
});

test.afterAll(async () => {
  await leader?.context().close();
});

/** Opens a song's page from the repertoire. */
async function openSong(title: string) {
  await leader.goto(`/b/${band.slug}/songs`);
  await leader
    .getByRole("list", { name: "Repertoire" })
    .getByRole("listitem")
    .filter({ hasText: title })
    .click();
  await expect(leader.getByRole("heading", { name: title })).toBeVisible();
}

test("lyrics found online, previewed, used, then edited and viewed full screen", async () => {
  await openSong("Zombie");
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

  // Full screen for the stage: a larger text in capitals (#296), both remembered on the device.
  await leader.getByRole("button", { name: "View", exact: true }).click();
  const view = leader.getByRole("dialog", { name: "Zombie" });
  const text = view.getByText("And the violence caused such silence");
  const capitals = view.getByRole("button", { name: "Capitals" });
  await expect(text).toHaveCSS("font-size", "26px");
  await expect(text).toHaveCSS("text-transform", "none");
  await expect(capitals).toHaveAttribute("aria-pressed", "false");
  await view.getByRole("button", { name: "Larger text" }).click();
  await capitals.click();
  await expect(text).toHaveCSS("font-size", "32px");
  await expect(text).toHaveCSS("text-transform", "uppercase");
  await view.getByRole("button", { name: "Close" }).click();
  await expect(leader.getByRole("dialog")).toHaveCount(0);
  await leader.getByRole("button", { name: "View", exact: true }).click();
  await expect(text).toHaveCSS("font-size", "32px");
  await expect(text).toHaveCSS("text-transform", "uppercase");
  await expect(capitals).toHaveAttribute("aria-pressed", "true");
  // Back to the lyrics as written.
  await capitals.click();
  await expect(text).toHaveCSS("text-transform", "none");
  await leader.keyboard.press("Escape");
  await expect(leader.getByRole("dialog")).toHaveCount(0);
});

test("a song LRCLIB lists as an instrumental: a web search, then a free one", async () => {
  await openSong("Creep");
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
});

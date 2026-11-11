import { expect, type Locator, type Page, test } from "@playwright/test";
import { type Band, newBand } from "./support";

// The repertoire: songs added, filled in, sorted, archived and deleted. Their lyrics, links and
// documents: lyrics.e2e.ts, song-media.e2e.ts.
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;
/** The repertoire's songs. */
let songs: Locator;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Songs");
  leader = band.leader;
  songs = leader.getByRole("list", { name: "Repertoire" }).getByRole("listitem");
});

test.afterAll(async () => {
  await leader?.context().close();
});

const backToRepertoire = () => leader.getByRole("link", { name: "Repertoire" }).first().click();

test("members add songs: the title and artist first, then a warning for a duplicate", async () => {
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
});

test("Search and add: Deezer's details and YouTube's videos (#219)", async () => {
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
});

test("a song's details, notes, status and energy, and its history (#286)", async () => {
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
  // The song's history (#286), a closed accordion. Its documents' changes: song-media.e2e.ts.
  await leader.getByRole("button", { name: "History" }).click();
  const history = leader.getByRole("list", { name: "History" });
  await expect(history.getByRole("listitem").first()).toContainText(
    "Lea Leader updated song “Zombie”",
  );
  await expect(history).toContainText("Lea Leader marked song “Zombie” as learning");
  await expect(history).toContainText("Lea Leader added song “Zombie”");
});

test("the repertoire filtered and reversed (#218); the journal names the songs (#285)", async () => {
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
  const journal = leader.getByRole("list", { name: "Latest activity" });
  await expect(journal.getByRole("listitem").first()).toContainText(
    "Lea Leader updated song “Zombie”",
  );
  // The song is a link to its page (#285); the entries past the fixed height, a tap away.
  await expect(
    journal.getByRole("listitem").first().getByRole("link", { name: "song “Zombie”" }),
  ).toHaveAttribute("href", /\/songs\/[0-9a-f-]+$/);
  await leader.getByRole("button", { name: "View more" }).click();
  await expect(leader.getByRole("button", { name: "View more" })).toBeHidden();
  await expect(journal).toContainText("Lea Leader marked song “Zombie” as learning");
  await expect(journal).toContainText("Lea Leader added song “Zombie”");
});

test("a song archived, found apart and restored; the band leader deletes another for good", async () => {
  await leader.getByRole("link", { name: "Repertoire" }).click();
  await songs
    .filter({ hasText: /Creep/ })
    .filter({ hasText: /Radiohead/ })
    .click();
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

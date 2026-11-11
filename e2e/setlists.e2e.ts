import { expect, type Page, test } from "@playwright/test";
import { addSong, type Band, newBand } from "./support";

// Setlists (#271 to #273), and the band's numbers (#284).
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Setlists");
  leader = band.leader;
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("members manage setlists: create, a taken title, rename, archive, restore, delete (#271)", async () => {
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  await expect(leader.getByText("No setlists yet")).toBeVisible();
  const create = async (title: string) => {
    await leader.getByRole("button", { name: "New setlist" }).click();
    const dialog = leader.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "New setlist" }).click();
    return dialog;
  };

  // Created, then opened.
  await create("Wedding, full night");
  await expect(leader.getByRole("heading", { name: "Wedding, full night" })).toBeVisible();
  await expect(leader.getByText("By Lea Leader")).toBeVisible();

  // A title is unique in the band.name, whatever its case.
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  const taken = await create("WEDDING, FULL NIGHT");
  await expect(taken.getByRole("alert")).toHaveText(
    "The band already has a setlist with this title.",
  );
  await taken.getByRole("button", { name: "Cancel" }).click();

  // Renamed from its menu in the list.
  const setlists = leader.getByRole("list", { name: "Setlists" });
  await setlists.getByRole("button", { name: "Actions for Wedding, full night" }).click();
  await leader.getByRole("menuitem", { name: "Rename" }).click();
  await leader.getByRole("dialog").getByLabel("Title").fill("Wedding");
  await leader.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  await expect(setlists.getByRole("link", { name: /Wedding/ })).toContainText("Wedding");

  // Archived: out of the current ones, read-only, then restored from its page.
  await setlists.getByRole("button", { name: "Actions for Wedding" }).click();
  await leader.getByRole("menuitem", { name: "Archive" }).click();
  await expect(leader.getByText("No setlists yet")).toBeVisible();
  await leader.getByRole("link", { name: /Archived/ }).click();
  await setlists.getByRole("link", { name: /Wedding/ }).click();
  await expect(leader.getByText("This setlist is archived: it's read-only.")).toBeVisible();
  await leader.getByRole("button", { name: "Restore" }).click();
  await expect(leader.getByText("This setlist is archived")).toBeHidden();

  // The journal tells it.
  await leader.getByRole("link", { name: "Home" }).first().click();
  await expect(leader.getByText("Lea Leader restored setlist “Wedding”")).toBeVisible();
  // The setlist is a link to its page (#285).
  await leader
    .getByRole("list", { name: "Latest activity" })
    .getByRole("link", { name: "setlist “Wedding”" })
    .first()
    .click();
  await expect(leader.getByRole("heading", { name: "Wedding" })).toBeVisible();

  // Deleted for good by the band leader, confirmed.
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  await create("To delete");
  await leader.getByRole("button", { name: "Actions for To delete" }).click();
  await leader.getByRole("menuitem", { name: "Delete…" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(leader.getByText("Setlist deleted")).toBeVisible();
  await expect(leader.getByRole("list", { name: "Setlists" })).not.toContainText("To delete");
});

test("members build a two-part setlist and see its duration (#272)", async () => {
  // Songs with known statuses and durations.
  await addSong(band, { title: "Africa", artist: "Toto", standardDuration: 295, status: "ready" });
  await addSong(band, { title: "Linger", artist: "The Cranberries", status: "ready" });
  await addSong(band, {
    title: "Black Hole Sun",
    artist: "Soundgarden",
    standardDuration: 318,
    status: "learning",
  });
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  await leader
    .getByRole("list", { name: "Setlists" })
    .getByRole("link", { name: /Wedding/ })
    .click();
  const part1 = leader.getByRole("region", { name: "Part 1" });
  await expect(part1).toContainText("No songs in this part yet.");

  // Full screen on a phone (#283): ready songs only, unless the songs being learned are asked
  // for too; a song is chosen by tapping its row.
  await leader.getByRole("button", { name: "Add songs" }).click();
  const dialog = leader.getByRole("dialog");
  const choices = dialog.getByRole("list", { name: "Songs to add" });
  const choice = (title: string) => choices.getByRole("button", { name: new RegExp(`^${title}`) });
  await expect(choice("Africa")).toBeVisible();
  await expect(dialog.getByText("Black Hole Sun")).toHaveCount(0);
  // Cancel adds nothing.
  await choice("Africa").click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(part1).toContainText("No songs in this part yet.");
  await leader.getByRole("button", { name: "Add songs" }).click();
  // Sorted by title, either way.
  await expect(choices.getByRole("button").first()).toContainText("Africa");
  await dialog.getByRole("button", { name: "Ascending" }).click();
  await expect(choices.getByRole("button").first()).toContainText("Linger");
  await choice("Africa").click();
  await choice("Linger").click();
  await expect(choice("Africa")).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Add 2 songs to Part 1" }).click();
  await expect(part1.getByText("Africa")).toBeVisible();
  await expect(part1.getByText("Linger")).toBeVisible();

  // A second part: added songs go to the last one; a song already there says where, and that
  // it would be played twice once chosen.
  await leader.getByRole("button", { name: "Add a part" }).click();
  await leader.getByRole("button", { name: "Add songs" }).click();
  await dialog.getByLabel("Also show the songs being learned").check();
  await expect(choice("Africa")).toContainText("Played in Part 1");
  await choice("Black Hole Sun").click();
  await choice("Africa").click();
  await expect(dialog.getByText("In Part 1: it will be played twice")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 2 songs to Part 2" }).click();
  const part2 = leader.getByRole("region", { name: "Part 2" });
  await expect(part2.getByText("Also in Part 1")).toBeVisible();

  // The duration: Africa twice and Black Hole Sun; Linger has none.
  await expect(leader.getByText("~15 min")).toBeVisible();
  await expect(leader.getByText("1 song without a duration is not counted")).toBeVisible();

  // The second part named; a song moved with the buttons, from one part to the next.
  await part2.getByRole("button", { name: "Actions for Part 2" }).click();
  await leader.getByRole("menuitem", { name: "Rename" }).click();
  await leader.getByRole("dialog").getByLabel("Name").fill("Encore");
  await leader.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  const encore = leader.getByRole("region", { name: "Encore" });
  await part1.locator("button[aria-pressed]").filter({ hasText: "Linger" }).click();
  await leader.getByRole("button", { name: "Move down" }).click();
  await expect(encore.locator("li").first()).toContainText("Linger");
  await expect(leader.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // Saved: the same after a reload, and in the list.
  await leader.reload();
  await expect(leader.getByRole("region", { name: "Encore" }).locator("li").first()).toContainText(
    "Linger",
  );
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  const card = leader.getByRole("list", { name: "Setlists" }).getByRole("listitem").filter({
    hasText: "Wedding",
  });
  await expect(card).toContainText("~15 min");
  await expect(card).toContainText("4 songs");
  await expect(card).toContainText("2 parts");
});

test("a setlist duplicated, then changed without changing the original (#273)", async () => {
  // From the list: the copy opens, with the same parts and songs.
  await leader
    .getByRole("list", { name: "Setlists" })
    .getByRole("button", { name: "Actions for Wedding" })
    .click();
  await leader.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(leader.getByRole("heading", { name: "Wedding (copy)" })).toBeVisible();
  const encore = leader.getByRole("region", { name: "Encore" });
  await expect(encore.locator("li").first()).toContainText("Linger");

  // Linger taken out of the copy only.
  await encore.locator("button[aria-pressed]").filter({ hasText: "Linger" }).click();
  await leader.getByRole("button", { name: "Remove" }).click();
  await expect(encore).not.toContainText("Linger");
  await expect(leader.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await leader.getByRole("link", { name: "Setlists" }).first().click();
  const cards = leader.getByRole("list", { name: "Setlists" }).getByRole("listitem");
  await expect(cards.filter({ hasText: "Wedding (copy)" })).toContainText("3 songs");
  await expect(cards.filter({ hasText: /^Wedding~/ })).toContainText("4 songs");
});

test("the band's home shows its numbers, each opening its page (#284)", async () => {
  await leader
    .getByRole("navigation", { name: "Band sections" })
    .getByRole("link", { name: "Home" })
    .click();
  await expect(leader).toHaveURL(/\/b\/[^/]+$/);
  const bandSlug = new URL(leader.url()).pathname.split("/")[2];
  // An array, or an object holding one (the setlists).
  const count = async (path: string) => {
    const body: unknown = await (await leader.request.get(`/api/bands/${bandSlug}/${path}`)).json();
    const list = Array.isArray(body) ? body : Object.values(body as object).find(Array.isArray);
    return (list as unknown[]).length;
  };
  const songs = (await count("songs")) + (await count("songs?archived=true"));
  const setlists = (await count("setlists")) + (await count("setlists?archived=true"));
  const members = await count("members");
  const overview = leader.getByRole("list").filter({ hasText: "Gigs to come" });
  await expect(overview.getByRole("link", { name: `${songs} Songs` })).toBeVisible();
  await expect(overview.getByRole("link", { name: `${members} Members` })).toBeVisible();
  await expect(overview.getByText("Coming soon")).toBeVisible();
  await overview.getByRole("link", { name: `${setlists} Setlists` }).click();
  await expect(leader).toHaveURL(/\/setlists$/);
});

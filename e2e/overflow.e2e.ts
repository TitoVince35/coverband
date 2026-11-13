import { expect, type Locator, type Page, test } from "@playwright/test";
import { addSetlist, addSong, type Band, newBand } from "./support";

// Nothing wider than a narrow phone's screen: no page scrolling sideways, nothing cut at the edge
// (the lyrics view's buttons and lines, cut by a long title; the repertoire's filters widening the
// page). Every page and the main dialogs, at 320 px, with the longest names a band would type.
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 320, height: 800 } });

let band: Band;
let page: Page;
let songId: string;
let setlistId: string;

const LONG_TITLE =
  "The extraordinarily long and winding title of an imaginary song played by our band";

test.beforeAll(async ({ browser }) => {
  // Hyphens: a band name that can't wrap (it also makes the band leader's email).
  band = await newBand(browser, "Overflowingly-Long-Band-Name-For-Phones");
  page = band.leader;
  await page.setViewportSize({ width: 320, height: 800 });
  songId = await addSong(band, {
    title: LONG_TITLE,
    artist: "The Imaginary Orchestra of Somewhere Very Far Away and Their Friends",
    style: "Progressive psychedelic garage",
    standardDuration: 295,
    tempo: 120,
    key: "B",
    notes: "Some notes that are quite long too, to see how the notes block behaves on a phone.",
    lyrics: [
      "A first invented line that goes on and on, much longer than any phone could ever show",
      "Short line",
      "",
      "Another invented verse, written only to test how the text wraps on a narrow screen",
    ].join("\n"),
  });
  const short = await addSong(band, { title: "Short", artist: "Band" });
  await addSetlist(band, `${LONG_TITLE} setlist`, [
    { name: "A part with a long name for the test", songs: [songId, short] },
    { songs: [short] },
  ]);
  const res = await page.request.get(`/api/bands/${band.slug}/setlists`);
  setlistId = ((await res.json()) as { setlists: { id: string }[] }).setlists[0]?.id ?? "";
});

/**
 * What goes past the screen's sides: the page scrolling sideways, an element out of the screen
 * that no ancestor within it clips (truncated text is fine), a scroll area scrolling sideways
 * that isn't meant to (`overflow-x-auto` is: the repertoire's filters).
 */
function overflows() {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out = (r: DOMRect) => r.right > width + 1 || r.left < -1;
    const describe = (el: Element) => {
      const r = el.getBoundingClientRect();
      const text = (el.textContent ?? "").trim().slice(0, 40);
      return `<${el.tagName.toLowerCase()}> "${text}" [${Math.round(r.left)}..${Math.round(r.right)}]`;
    };
    const found: string[] = [];
    if (document.documentElement.scrollWidth > width + 1)
      found.push(`the page scrolls sideways (${document.documentElement.scrollWidth} px)`);
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden") continue;
      if (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth + 1 &&
        !el.classList.contains("overflow-x-auto")
      )
        found.push(`scrolls sideways: ${describe(el)}`);
      if (!out(r)) continue;
      // Only the outermost element out of the screen, unless an ancestor clips it.
      const parent = el.parentElement;
      if (parent && out(parent.getBoundingClientRect())) continue;
      let clipped = false;
      for (let a = parent; a; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible") {
          clipped = !out(a.getBoundingClientRect());
          break;
        }
      }
      if (!clipped) found.push(`out of the screen: ${describe(el)}`);
    }
    return found;
  });
}

async function check(url: string, open?: (p: Page) => Promise<Locator>) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  if (open) await expect(await open(page)).toBeVisible();
  expect.soft(await overflows()).toEqual([]);
}

const button = (p: Page, name: string) => p.getByRole("button", { name, exact: true }).first();
const opens = async (p: Page, ...names: string[]) => {
  for (const name of names) await button(p, name).click();
  return p.getByRole("dialog");
};

test("pages fit a narrow phone", async () => {
  const b = `/b/${band.slug}`;
  for (const [name, url] of [
    ["Bands", "/"],
    ["Account", "/account"],
    ["Contact", "/contact"],
    ["Band home", b],
    ["Lineup", `${b}/lineup`],
    ["Band settings", `${b}/settings`],
    ["Repertoire", `${b}/songs`],
    ["Archived songs", `${b}/songs/archived`],
    ["Setlists", `${b}/setlists`],
    ["Archived setlists", `${b}/setlists/archived`],
    ["Setlist", `${b}/setlists/${setlistId}`],
    ["Live", `${b}/setlists/${setlistId}/live`],
  ] as const) {
    await test.step(name, () => check(url));
  }
  await test.step("Song, every block open", () =>
    check(`${b}/songs/${songId}`, async (p) => {
      for (const name of ["Details", "Lyrics", "Documents", "History"]) {
        const block = button(p, name);
        await expect(block).toBeVisible();
        if ((await block.getAttribute("aria-expanded")) === "false") await block.click();
      }
      return p.getByText("Short line");
    }));
});

test("dialogs and menus fit a narrow phone", async () => {
  const b = `/b/${band.slug}`;
  const song = `${b}/songs/${songId}`;
  for (const [name, url, open] of [
    [
      "Band menu",
      b,
      async (p) => {
        await button(p, "Band menu").click();
        return p.getByRole("menu");
      },
    ],
    [
      "Account menu",
      b,
      async (p) => {
        await button(p, "Account").click();
        return p.getByRole("menu");
      },
    ],
    ["Invite a musician", `${b}/lineup`, (p) => opens(p, "Invite a musician")],
    ["Edit my instruments", `${b}/lineup`, (p) => opens(p, "Edit my instruments")],
    ["Add a song", `${b}/songs`, (p) => opens(p, "Add a song")],
    ["Edit the song", song, (p) => opens(p, "Edit the song")],
    ["Edit the details", song, (p) => opens(p, "Details", "Edit the details")],
    ["Add a link", song, (p) => opens(p, "Add a link")],
    ["Add a document", song, (p) => opens(p, "Documents", "Add a document")],
    ["Edit the lyrics", song, (p) => opens(p, "Lyrics", "Edit")],
    ["Lyrics view", song, (p) => opens(p, "Lyrics", "View")],
    ["Add songs", `${b}/setlists/${setlistId}`, (p) => opens(p, "Add songs")],
    ["New setlist", `${b}/setlists`, (p) => opens(p, "New setlist")],
  ] satisfies [string, string, (p: Page) => Promise<Locator>][]) {
    await test.step(name, () => check(url, open));
  }
});

import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { BASE_URL } from "./playwright.config";
import { addSetlist, addSong, type Band, newBand } from "./support";

// Setlists live (brief 031): the live mode page (#307), the lyrics with previous and next song
// (#308), the photos for my instruments (#309).
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

const LONG_NOTES =
  "Capo 2. Start with the drums alone for four bars, then everyone. Long ending: watch the singer.";

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Live");
  leader = band.leader;
  const africa = await addSong(band, {
    title: "Africa",
    artist: "Toto",
    standardDuration: 295,
    tempo: 92,
    key: "B",
    notes: "Short note",
    lyrics: "I hear the drums echoing tonight\nBut she hears only whispers",
  });
  const linger = await addSong(band, {
    title: "Linger",
    artist: "The Cranberries",
    standardDuration: 274,
    key: "D",
    bandKey: "C",
    notes: LONG_NOTES,
  });
  // The band leader plays the bass; Africa has photos for the bass, the guitar and everyone, and
  // a PDF (no button in this first version).
  const api = leader.request;
  expect(
    (
      await api.put(`/api/bands/${band.slug}/members/me/instruments`, {
        data: { instruments: [{ code: "bass_guitar" }] },
      })
    ).ok(),
  ).toBe(true);
  const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url));
  for (const [title, instruments, file, mimeType] of [
    ["Bass line", [{ code: "bass_guitar" }], "photo.jpg", "image/jpeg"],
    ["Guitar riff", [{ code: "guitar" }], "photo.jpg", "image/jpeg"],
    ["Stage plan", [], "thumbnail.jpg", "image/jpeg"],
    ["Bass chart", [{ code: "bass_guitar" }], "horns.pdf", "application/pdf"],
  ] as const) {
    const res = await api.post(`/api/bands/${band.slug}/songs/${africa}/documents`, {
      // A form post: the API's cross-site check wants its origin.
      headers: { origin: BASE_URL },
      multipart: {
        file: { name: file, mimeType, buffer: await fixture(file) },
        title,
        instruments: JSON.stringify(instruments),
      },
    });
    expect(res.ok()).toBe(true);
  }
  await addSetlist(band, "Wedding", [
    { name: "Set 1", songs: [africa, linger] },
    { songs: [linger] },
  ]);
  // Added through the API: the page loaded before doesn't know it yet.
  await leader.reload();
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("live mode: over the whole app, the setlist read on stage, then left (#307)", async () => {
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  await leader
    .getByRole("list", { name: "Setlists" })
    .getByRole("link", { name: /Wedding/ })
    .click();
  await leader.getByRole("link", { name: "Live" }).click();

  const live = leader.getByRole("dialog", { name: "Wedding" });
  await expect(live.getByRole("heading", { name: "Wedding" })).toBeVisible();
  // The compact header: the band, its number of songs and its duration.
  await expect(live).toContainText(`${band.name} · 3 songs · 14 min`);
  // Nothing of the app shows over it: at the bottom of the screen (the band's bottom bar), the
  // live page.
  const atBottom = await leader.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 10);
    return Boolean(element?.closest('[role="dialog"]'));
  });
  expect(atBottom).toBe(true);

  const set1 = live.getByRole("region", { name: "Set 1" });
  await expect(set1).toContainText("9 min");
  const africa = set1.getByRole("listitem").first();
  await expect(africa).toContainText("1Africa · Toto");
  await expect(africa).toContainText("92 BPM · B");
  // The band's key first.
  await expect(set1.getByRole("listitem").nth(1)).toContainText("C");
  await expect(live.getByRole("region", { name: "Part 2" })).toContainText("Linger");

  // Short notes show whole; longer ones on one line, whole with a tap.
  await expect(africa.getByRole("button", { name: "Short note" })).toBeDisabled();
  const more = set1.getByRole("button", { name: "Show all the notes" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(set1.getByRole("button", { name: LONG_NOTES })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  // Nothing to edit.
  await expect(live.getByRole("button", { name: /Actions/ })).toHaveCount(0);

  await leader.getByRole("link", { name: "Leave live mode" }).click();
  await expect(live).toHaveCount(0);
  await expect(leader.getByRole("heading", { name: "Wedding" })).toBeVisible();
});

test("a song's lyrics from live mode, then the next and previous songs (#308)", async () => {
  await leader.getByRole("link", { name: "Live" }).click();
  const live = leader.getByRole("dialog", { name: "Wedding" });
  const set1 = live.getByRole("region", { name: "Set 1" });
  // Only a song with lyrics has the button.
  await expect(set1.getByRole("button", { name: "Lyrics" })).toHaveCount(1);
  await set1.getByRole("button", { name: "Lyrics" }).click();

  const lyrics = leader.getByRole("dialog", { name: "Africa" });
  await expect(lyrics).toContainText("I hear the drums echoing tonight");
  // The first song: no previous one.
  await expect(lyrics.getByRole("button", { name: /Previous song/ })).toHaveCount(0);
  await lyrics.getByRole("button", { name: "Next song: Linger" }).click();
  // A song without lyrics says so: the set's order stays visible.
  const linger = leader.getByRole("dialog", { name: "Linger" });
  await expect(linger).toContainText("No lyrics for this song.");
  // Across parts: Part 2's Linger, the last song.
  await linger.getByRole("button", { name: "Next song: Linger" }).click();
  await expect(linger.getByRole("button", { name: /Next song/ })).toHaveCount(0);
  await linger.getByRole("button", { name: "Previous song: Linger" }).click();
  await linger.getByRole("button", { name: "Previous song: Africa" }).click();
  await expect(leader.getByRole("dialog", { name: "Africa" })).toContainText("whispers");

  // Closing goes back to the list.
  await leader
    .getByRole("dialog", { name: "Africa" })
    .getByRole("button", { name: "Close" })
    .click();
  await expect(leader.getByRole("dialog", { name: "Africa" })).toHaveCount(0);
  await expect(set1).toBeVisible();
  await leader.getByRole("link", { name: "Leave live mode" }).click();
});

test("a song's photos for my instruments, all of them on demand, full screen (#309)", async () => {
  await leader.getByRole("link", { name: "Live" }).click();
  const live = leader.getByRole("dialog", { name: "Wedding" });
  const africa = live.getByRole("region", { name: "Set 1" }).getByRole("listitem").first();
  // Mine (the bass) and the untagged one; no PDF.
  await expect(africa.getByRole("button", { name: /^Photo:/ })).toHaveCount(2);
  await expect(africa.getByRole("button", { name: "Photo: Bass guitar" })).toBeVisible();
  await expect(africa.getByRole("button", { name: "Photo: Stage plan" })).toBeVisible();

  // Every instrument's, remembered on the phone.
  const all = live.getByRole("button", { name: "All instruments" });
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(africa.getByRole("button", { name: "Photo: Guitar" })).toBeVisible();
  await leader.getByRole("link", { name: "Leave live mode" }).click();
  await leader.getByRole("link", { name: "Live" }).click();
  await expect(africa.getByRole("button", { name: "Photo: Guitar" })).toBeVisible();
  await all.click();
  await expect(africa.getByRole("button", { name: "Photo: Guitar" })).toHaveCount(0);

  // Full screen inside the app, then back to the list.
  await africa.getByRole("button", { name: "Photo: Bass guitar" }).click();
  const photo = leader.getByRole("dialog", { name: "Bass line" });
  await expect(photo.getByRole("img", { name: "Bass line" })).toBeVisible();
  await expect
    .poll(() => photo.getByRole("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await photo.getByRole("button", { name: "Close" }).click();
  await expect(photo).toHaveCount(0);
  await expect(africa).toBeVisible();
  await leader.getByRole("link", { name: "Leave live mode" }).click();
});

test("live mode works offline (#307, #308, #309)", async () => {
  await leader.context().setOffline(true);
  const button = leader.getByRole("link", { name: "Live" });
  await expect(button).toBeVisible();
  await button.click();
  const live = leader.getByRole("dialog", { name: "Wedding" });
  await expect(live.getByRole("region", { name: "Set 1" })).toContainText("Africa");
  await expect(live.getByRole("button", { name: "Show all the notes" }).first()).toBeVisible();
  await live.getByRole("button", { name: "Lyrics" }).click();
  await expect(leader.getByRole("dialog", { name: "Africa" })).toContainText("drums echoing");
  await leader.keyboard.press("Escape");
  await expect(leader.getByRole("dialog", { name: "Africa" })).toHaveCount(0);
  // The photos saved on the phone open offline.
  await live.getByRole("button", { name: "Photo: Bass guitar" }).click();
  const photo = leader.getByRole("dialog", { name: "Bass line" });
  await expect
    .poll(() => photo.getByRole("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await photo.getByRole("button", { name: "Close" }).click();
  await leader.goBack();
  await expect(live).toHaveCount(0);
  await leader.context().setOffline(false);
});

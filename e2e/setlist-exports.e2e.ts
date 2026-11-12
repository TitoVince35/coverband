import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { addSetlist, addSong, type Band, newBand } from "./support";

// Setlist exports (brief 030): the docx (#297).
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Exports");
  leader = band.leader;
  const africa = await addSong(band, { title: "Africa", artist: "Toto", standardDuration: 295 });
  const linger = await addSong(band, { title: "Linger", artist: "The Cranberries" });
  await addSetlist(band, "Wedding", [{ name: "Set 1", songs: [africa, linger] }]);
  // Added through the API: the page loaded before doesn't know it yet.
  await leader.reload();
});

test.afterAll(async () => {
  // Deleting the setlist deletes its exports' files from the bucket (the teardown only reaches
  // the database).
  const api = `/api/bands/${band.slug}/setlists`;
  const { setlists } = (await (await leader.request.get(api)).json()) as {
    setlists: { id: string }[];
  };
  for (const { id } of setlists) await leader.request.delete(`${api}/${id}`);
  await leader?.context().close();
});

test("a member exports a setlist to docx; offline, the button is turned off (#297)", async () => {
  await leader.getByRole("link", { name: "Setlists" }).first().click();
  await leader
    .getByRole("list", { name: "Setlists" })
    .getByRole("link", { name: /Wedding/ })
    .click();
  const button = leader.getByRole("button", { name: "Export to docx" });

  const [download] = await Promise.all([leader.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe("Wedding.docx");
  const bytes = await readFile(await download.path());
  // A docx is a zip file.
  expect(bytes.subarray(0, 2).toString()).toBe("PK");

  // Again: the same file, served from the bucket.
  const [again] = await Promise.all([leader.waitForEvent("download"), button.click()]);
  expect((await readFile(await again.path())).equals(bytes)).toBe(true);

  await leader.context().setOffline(true);
  await expect(button).toBeDisabled();
  await leader.context().setOffline(false);
  await expect(button).toBeEnabled();
});

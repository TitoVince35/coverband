import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { addSetlist, addSong, type Band, newBand } from "./support";

// Setlist exports (brief 030): the docx (#297), the PDF to print (#298).
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

test("Print opens the PDF in a new tab; offline, it is turned off (#298)", async () => {
  const print = leader.getByRole("link", { name: "Print" });
  await expect(print).toHaveAttribute("target", "_blank");
  const href = (await print.getAttribute("href")) ?? "";
  expect(href).toMatch(/\/exports\/pdf\?lang=en&tz=/);
  // A new tab: what it shows depends on the browser (headless Chromium downloads a PDF instead).
  const [tab] = await Promise.all([leader.context().waitForEvent("page"), print.click()]);
  const pdf = await leader.request.get(href);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain('inline; filename="Wedding.pdf"');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await tab.close();

  // Two songs swapped: once saved, Print has a new address, and a new PDF (never a kept copy).
  await leader.locator("button[aria-pressed]").filter({ hasText: "Africa" }).click();
  await leader.getByRole("button", { name: "Move down" }).click();
  await expect(leader.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(print).not.toHaveAttribute("href", href);
  const swapped = (await print.getAttribute("href")) ?? "";
  const after = await leader.request.get(swapped);
  expect(after.headers()["cache-control"]).toBe("no-store");
  expect((await after.body()).equals(await pdf.body())).toBe(false);

  await leader.context().setOffline(true);
  await expect(leader.getByRole("button", { name: "Print" })).toBeDisabled();
  await leader.context().setOffline(false);
  await expect(leader.getByRole("link", { name: "Print" })).toBeVisible();
});

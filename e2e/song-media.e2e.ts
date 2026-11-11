import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { addSong, type Band, newBand } from "./support";

// A song's links (videos, Deezer) and documents (photos, PDFs).
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Media");
  leader = band.leader;
  await addSong(band, { title: "Zombie", artist: "The Cranberries" });
  await leader.goto(`/b/${band.slug}/songs`);
  await leader
    .getByRole("list", { name: "Repertoire" })
    .getByRole("listitem")
    .filter({ hasText: "Zombie" })
    .click();
  await expect(leader.getByRole("heading", { name: "Zombie" })).toBeVisible();
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("links: the provider shows, they open in a new tab; one found on Deezer (#220)", async () => {
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
  await expect(links).toHaveCount(1);
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
  // Oldest first.
  await expect(links).toHaveCount(2);
  await expect(links.last()).toContainText("Deezer");
});

test("documents: a photo made smaller, a PDF, edited and deleted (#239)", async () => {
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
  // A tap outside (the photo picker's, on a phone) never closes it: the file would be lost.
  await leader.mouse.click(5, 5);
  await expect(doc).toBeVisible();
  await expect(doc.getByLabel("Title", { exact: true })).toHaveValue("photo");
  await doc.getByLabel("Title", { exact: true }).fill("Chords");
  await doc.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Document added")).toBeVisible();
  await expect(documents).toHaveCount(1);
  await expect(documents.first()).toContainText("Chords");
  await expect(documents.first()).toContainText("Photo · added by Lea Leader");
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
  await leader.getByRole("button", { name: "Edit the document Horns part" }).click();
  await doc.getByRole("button", { name: "Delete" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(leader.getByText("Document removed")).toBeVisible();
  await expect(documents).toHaveCount(1);

  // The song's history (#286) tells it too.
  await leader.getByRole("button", { name: "History" }).click();
  const history = leader.getByRole("list", { name: "History" });
  await expect(history.getByRole("listitem").first()).toContainText(
    "Lea Leader removed a document from song “Zombie”",
  );
  await expect(history).toContainText("Lea Leader added a document to song “Zombie”");
});

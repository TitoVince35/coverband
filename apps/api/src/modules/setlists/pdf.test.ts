import { expect, test } from "bun:test";
import sharp from "sharp";
import { exportDocument } from "./export-document";
import { printableKey, renderPdf } from "./pdf";

const song = (i: number) => ({
  title: `Song ${i} with Élan, Ørsted and Ψ`,
  artist: "Artist",
  standardDuration: 200,
  ownDuration: null,
  energy: i % 4 || null,
  key: "Em" as const,
  tempo: 100 + i,
  bandKey: null,
});

const documentOf = (counts: number[]) =>
  exportDocument(
    {
      title: "Wedding",
      updatedAt: new Date("2026-11-12T10:00:00Z"),
      band: { name: "The Covers", logoKey: null },
      parts: counts.map((n, p) => ({
        name: null,
        songs: Array.from({ length: n }, (_, i) => song(p * 100 + i)),
      })),
    },
    { language: "fr", timeZone: "Europe/Paris" },
  );

/** How many pages a PDF has. */
const pagesOf = (bytes: Uint8Array) =>
  (new TextDecoder("latin1").decode(bytes).match(/\/Type \/Page\b/g) ?? []).length;

test("a PDF, one page for a short setlist, with the bundled font", async () => {
  const bytes = await renderPdf(documentOf([8, 5]), {
    logo: null,
    generatedOn: "12 novembre 2026",
  });
  const text = new TextDecoder("latin1").decode(bytes);
  expect(text.startsWith("%PDF-")).toBe(true);
  expect(pagesOf(bytes)).toBe(1);
  expect(text).toContain("NotoSans-Bold");
});

test("parts that don't share a page: as many pages, the logo on each, embedded once", async () => {
  const png = await sharp({ create: { width: 300, height: 600, channels: 4, background: "#08f" } })
    .png()
    .toBuffer();
  const logo = { png: new Uint8Array(png), width: 300, height: 600 };
  const pdfOf = (songCounts: number[]) =>
    renderPdf(documentOf(songCounts), { logo, generatedOn: "12 novembre 2026" });
  const images = (bytes: Uint8Array) =>
    new TextDecoder("latin1").decode(bytes).match(/\/Subtype \/Image/g)?.length ?? 0;
  const bytes = await pdfOf([20, 20, 24]);
  expect(pagesOf(bytes)).toBe(3);
  // The main header on every page, its logo embedded only once (with its transparency mask).
  expect(images(bytes)).toBeGreaterThan(0);
  expect(images(bytes)).toBe(images(await pdfOf([8])));
});

test("printableKey: sharps and flats the font can write", () => {
  expect(printableKey("F♯m")).toBe("F#m");
  expect(printableKey("D♭")).toBe("Db");
  expect(printableKey("Em")).toBe("Em");
});

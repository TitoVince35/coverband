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

test("parts that don't share a page: as many pages, a logo on the first", async () => {
  const png = await sharp({ create: { width: 300, height: 600, channels: 4, background: "#08f" } })
    .png()
    .toBuffer();
  const bytes = await renderPdf(documentOf([20, 20, 50]), {
    logo: { png: new Uint8Array(png), width: 300, height: 600 },
    generatedOn: "12 novembre 2026",
  });
  expect(pagesOf(bytes)).toBe(3);
  expect(new TextDecoder("latin1").decode(bytes)).toContain("/Subtype /Image");
});

test("printableKey: sharps and flats the font can write", () => {
  expect(printableKey("F♯m")).toBe("F#m");
  expect(printableKey("D♭")).toBe("Db");
  expect(printableKey("Em")).toBe("Em");
});

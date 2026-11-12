// Draws the setlist PDF examples (#299) from fixed data, no database:
//   bun run setlist:examples   → doc/setlist-exports/*.pdf, and a PNG of each page
// The images need pdftoppm (poppler: sudo apt install poppler-utils); without it, only the PDFs.
import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import type { ExportLogo } from "../modules/setlists/docx";
import { exportDate, exportDocument } from "../modules/setlists/export-document";
import { renderPdf } from "../modules/setlists/pdf";
import { PDF_EXAMPLES, type PdfExample } from "../modules/setlists/pdf-examples";

const OUT = resolve(import.meta.dir, "../../../../doc/setlist-exports");

/** The same date on every run, so the files only change when the PDF does. */
const DATE = new Date("2026-11-12T18:00:00Z");

/** A made-up logo, drawn from shapes (no text: no font needed). */
async function logo(kind: NonNullable<PdfExample["logo"]>): Promise<ExportLogo> {
  const sizes = { wide: [900, 300], tall: [300, 600], square: [400, 400] } as const;
  const [width, height] = sizes[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" rx="${height / 8}" fill="#007a55"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#ffd166"/>
    <rect x="${width * 0.1}" y="${height * 0.75}" width="${width * 0.8}" height="${height * 0.08}" fill="#ffffff"/>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png: new Uint8Array(png), width, height };
}

await mkdir(OUT, { recursive: true });
for (const file of await readdir(OUT)) {
  if (/\.(pdf|png)$/.test(file)) await rm(resolve(OUT, file));
}
const pdftoppm = Bun.which("pdftoppm");
if (!pdftoppm) console.warn("pdftoppm not found (poppler-utils): PDFs only, no images.");

for (const example of PDF_EXAMPLES) {
  const options = { language: example.language, timeZone: "Europe/Paris" };
  const document = exportDocument(
    {
      ...example.source,
      updatedAt: DATE,
      band: { name: "The Covers", logoKey: example.logo ? "example" : null },
    },
    options,
  );
  const bytes = await renderPdf(document, {
    logo: example.logo ? await logo(example.logo) : null,
    generatedOn: exportDate(DATE, options),
    createdAt: DATE,
  });
  const pdf = resolve(OUT, `${example.name}.pdf`);
  await Bun.write(pdf, bytes);
  if (pdftoppm) {
    const run = Bun.spawnSync([pdftoppm, "-r", "60", "-png", pdf, resolve(OUT, example.name)]);
    if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  }
  console.log(`${example.name}.pdf`);
}

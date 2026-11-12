import PDFDocument from "pdfkit";
import type { ExportLogo } from "./docx";
import { EXPORT_TEXTS, type ExportDocument, type ExportSong } from "./export-document";
import {
  COLUMN_GAP,
  CONTENT_WIDTH,
  fitText,
  layoutSetlist,
  MAIN_HEADER_HEIGHT,
  PAGE,
  SIZES,
} from "./pdf-layout";

/** Noto Sans, the app's font, bundled: the PDF's own Helvetica can't write every song title. */
const FONTS = {
  regular: new URL("./fonts/NotoSans-Regular.ttf", import.meta.url).pathname,
  bold: new URL("./fonts/NotoSans-Bold.ttf", import.meta.url).pathname,
};

const INK = "#111111";
const MUTED = "#555555";
const RULE = "#999999";
const PEPPER = "#d62828";

/** The logo's box on the first page: a third of the width at most. */
const LOGO_BOX = { width: CONTENT_WIDTH / 3, height: MAIN_HEADER_HEIGHT - 24 };

type Pdf = PDFKit.PDFDocument;

/** Draws one pepper (energy) with its top left corner here: a red body and a green stem. */
function pepper(pdf: Pdf, x: number, y: number, size: number) {
  const w = size * 0.62;
  pdf
    .save()
    .path(
      `M ${x + w * 0.35} ${y + size * 0.28}
       C ${x + w * 1.05} ${y + size * 0.2}, ${x + w * 1.1} ${y + size * 0.75}, ${x + w * 0.2} ${y + size}
       C ${x + w * 0.55} ${y + size * 0.7}, ${x} ${y + size * 0.45}, ${x + w * 0.35} ${y + size * 0.28} Z`,
    )
    .fill(PEPPER)
    .path(
      `M ${x + w * 0.4} ${y + size * 0.3} C ${x + w * 0.4} ${y + size * 0.12}, ${x + w * 0.6} ${y}, ${x + w * 0.85} ${y + size * 0.04}`,
    )
    .lineWidth(size * 0.1)
    .lineCap("round")
    .stroke("#2a9d4b")
    .restore();
}

/** A key as printed: Noto Sans has no ♯ nor ♭, written # and b as musicians do ("F#m", "Db"). */
export const printableKey = (key: string) => key.replace(/♯/g, "#").replace(/♭/g, "b");

/** The width peppers take. */
const peppersWidth = (energy: number | null, size: number) =>
  energy ? energy * size * 0.62 + (energy - 1) * size * 0.15 : 0;

/**
 * A song's details drawn right-aligned so they end at `right`: its peppers, key and duration.
 * Returns their left edge.
 */
function details(pdf: Pdf, song: ExportSong, right: number, baseline: number, size: number) {
  const text = [song.key && printableKey(song.key), song.duration].filter(Boolean).join("   ");
  pdf.font("regular").fontSize(size);
  const textWidth = text ? pdf.widthOfString(text) : 0;
  const gap = text && song.energy ? size * 0.6 : 0;
  const left = right - textWidth - gap - peppersWidth(song.energy, size);
  if (text) {
    pdf.fillColor(INK).text(text, right - textWidth, baseline - size, {
      lineBreak: false,
      width: textWidth + 1,
    });
  }
  for (let i = 0; i < (song.energy ?? 0); i++) {
    pepper(pdf, left + i * size * 0.77, baseline - size * 0.95, size);
  }
  return left;
}

/** The text of `text` cut to `width` in this font and size. */
function fit(pdf: Pdf, text: string, width: number, font: "regular" | "bold", size: number) {
  pdf.font(font).fontSize(size);
  return fitText(text, width, (value) => pdf.widthOfString(value));
}

/** A song on one column: index, title, artist, then its details on the right. */
function songLine(pdf: Pdf, song: ExportSong, x: number, top: number, width: number, s: number) {
  const titleSize = SIZES.songTitle * s;
  const small = SIZES.songDetails * s;
  const baseline = top + titleSize * 1.05;
  const indexWidth = titleSize * 1.4;
  pdf.font("regular").fontSize(small).fillColor(MUTED);
  pdf.text(String(song.index), x, baseline - small, { lineBreak: false });
  const detailsLeft = details(pdf, song, x + width, baseline, small);
  const room = detailsLeft - (x + indexWidth) - small;
  const title = fit(pdf, song.title, room, "bold", titleSize);
  pdf.fillColor(INK).text(title, x + indexWidth, baseline - titleSize * 1.05, { lineBreak: false });
  const titleWidth = pdf.widthOfString(title);
  const artist = fit(pdf, song.artist, room - titleWidth - small, "regular", small);
  if (artist && title === song.title) {
    pdf
      .fillColor(MUTED)
      .text(artist, x + indexWidth + titleWidth + small, baseline - small, { lineBreak: false });
  }
}

/** A song on two columns: index and title, then the artist and details on a small line. */
function songTwoLines(
  pdf: Pdf,
  song: ExportSong,
  x: number,
  top: number,
  width: number,
  s: number,
) {
  const titleSize = SIZES.songTitle * s;
  const small = SIZES.songDetails * s;
  const indexWidth = titleSize * 1.4;
  pdf.font("regular").fontSize(small).fillColor(MUTED);
  pdf.text(String(song.index), x, top + titleSize * 1.05 - small, { lineBreak: false });
  const title = fit(pdf, song.title, width - indexWidth, "bold", titleSize);
  pdf.fillColor(INK).text(title, x + indexWidth, top, { lineBreak: false });
  const baseline = top + titleSize * 1.3 + small * 1.05;
  const detailsLeft = details(pdf, song, x + width, baseline, small);
  const artist = fit(pdf, song.artist, detailsLeft - (x + indexWidth) - small, "regular", small);
  pdf.fillColor(MUTED).text(artist, x + indexWidth, baseline - small, { lineBreak: false });
}

function mainHeader(pdf: Pdf, document: ExportDocument, logo: ExportLogo | null) {
  const top = PAGE.margin;
  let left = PAGE.margin;
  if (logo) {
    const scale = Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    pdf.image(Buffer.from(logo.png), left, top + (LOGO_BOX.height - height) / 2, {
      width,
      height,
    });
    left += width + 18;
  }
  const right = PAGE.margin + CONTENT_WIDTH;
  const line = (text: string, aside: string | null, y: number, size: number, bold: boolean) => {
    pdf.font("regular").fontSize(13);
    const asideWidth = aside ? pdf.widthOfString(aside) : 0;
    if (aside) {
      pdf.fillColor(MUTED).text(aside, right - asideWidth, y + size - 13, { lineBreak: false });
    }
    const room = right - left - asideWidth - (aside ? 12 : 0);
    const fitted = fit(pdf, text, room, bold ? "bold" : "regular", size);
    pdf.fillColor(bold ? INK : MUTED).text(fitted, left, y, { lineBreak: false });
  };
  const middle = top + LOGO_BOX.height / 2;
  line(document.title, document.duration, middle - 34, 26, true);
  line(document.band, document.date, middle + 6, 15, false);
  pdf
    .moveTo(PAGE.margin, top + MAIN_HEADER_HEIGHT - 14)
    .lineTo(right, top + MAIN_HEADER_HEIGHT - 14)
    .lineWidth(1.2)
    .stroke(INK);
}

function partHeader(pdf: Pdf, name: string, duration: string | null, top: number, s: number) {
  const right = PAGE.margin + CONTENT_WIDTH;
  const size = SIZES.partName * s;
  pdf.font("regular").fontSize(SIZES.partDuration * s);
  const durationWidth = duration ? pdf.widthOfString(duration) : 0;
  if (duration) {
    pdf
      .fillColor(MUTED)
      .text(duration, right - durationWidth, top + (size - SIZES.partDuration * s), {
        lineBreak: false,
      });
  }
  const fitted = fit(pdf, name, CONTENT_WIDTH - durationWidth - 12, "bold", size);
  pdf.fillColor(INK).text(fitted, PAGE.margin, top - size * 0.1, { lineBreak: false });
  const ruleY = top + size * 1.45;
  pdf.moveTo(PAGE.margin, ruleY).lineTo(right, ruleY).lineWidth(0.6).stroke(RULE);
}

function footer(pdf: Pdf, text: string) {
  pdf.font("regular").fontSize(8).fillColor(MUTED);
  const width = pdf.widthOfString(text);
  pdf.text(text, (PAGE.width - width) / 2, PAGE.height - PAGE.margin - 8, { lineBreak: false });
}

/**
 * The PDF to print (#298): A4, the main header on the first page, each part whole on a page
 * (`layoutSetlist`), song titles large and bold, a footer on every page saying when it was made.
 */
export async function renderPdf(
  document: ExportDocument,
  {
    logo,
    generatedOn,
    createdAt = new Date(),
  }: { logo: ExportLogo | null; generatedOn: string; createdAt?: Date },
) {
  const pdf = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: document.title,
      Author: document.band,
      CreationDate: createdAt,
      ModDate: createdAt,
    },
  });
  pdf.registerFont("regular", FONTS.regular);
  pdf.registerFont("bold", FONTS.bold);
  const chunks: Uint8Array[] = [];
  pdf.on("data", (chunk: Uint8Array) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    pdf.on("end", resolve);
    pdf.on("error", reject);
  });

  const layout = layoutSetlist(document.parts.map((part) => part.songs.length));
  const s = layout.scale;
  const footerText = EXPORT_TEXTS[document.language].footer(generatedOn);
  layout.pages.forEach((placed, page) => {
    pdf.addPage({ size: "A4", margin: 0 });
    if (page === 0) mainHeader(pdf, document, logo);
    for (const { part: index, top, columns, rows } of placed) {
      const part = document.parts[index];
      if (!part) continue;
      partHeader(pdf, part.name, part.duration, top, s);
      const songsTop = top + SIZES.partHeader * s;
      if (columns === 1) {
        part.songs.forEach((song, i) => {
          songLine(pdf, song, PAGE.margin, songsTop + i * SIZES.songLine * s, CONTENT_WIDTH, s);
        });
      } else {
        const width = (CONTENT_WIDTH - COLUMN_GAP) / 2;
        part.songs.forEach((song, i) => {
          const column = i < rows ? 0 : 1;
          const row = i % rows;
          const x = PAGE.margin + column * (width + COLUMN_GAP);
          songTwoLines(pdf, song, x, songsTop + row * SIZES.songTwoLines * s, width, s);
        });
      }
    }
    footer(pdf, footerText);
  });
  pdf.end();
  await ended;
  return new Uint8Array(Buffer.concat(chunks));
}

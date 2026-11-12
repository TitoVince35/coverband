import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import {
  EXPORT_TEXTS,
  type ExportDocument,
  type ExportPart,
  type ExportSong,
  headerSummary,
} from "./export-document";

/** A logo ready for a document: PNG bytes and their size in pixels. */
export type ExportLogo = { png: Uint8Array; width: number; height: number };

/** A4 in twips (1/20 pt), with 2 cm margins. */
const PAGE = { width: 11906, height: 16838, margin: 1134 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;

/** The logo's box in the header, in pixels (96 per inch): a third of the width at most. */
const LOGO_BOX = { width: Math.floor(((CONTENT_WIDTH / 1440) * 96) / 3), height: 96 };

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

/** The logo fitted in its box, never enlarged. */
export function logoSize(logo: Pick<ExportLogo, "width" | "height">, box = LOGO_BOX) {
  const scale = Math.min(1, box.width / logo.width, box.height / logo.height);
  return {
    width: Math.max(1, Math.round(logo.width * scale)),
    height: Math.max(1, Math.round(logo.height * scale)),
  };
}

/** A line with text on the left and on the right (a right tab stop at `width`). */
function spread(left: TextRun[], right: string | null, width: number, size: number) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: width }],
    children: [...left, ...(right ? [new TextRun({ text: `\t${right}`, size })] : [])],
  });
}

function mainHeader(document: ExportDocument, logo: ExportLogo | null) {
  const logoWidth = logo ? Math.round(CONTENT_WIDTH / 3) : 0;
  const infoWidth = CONTENT_WIDTH - logoWidth;
  const info = new TableCell({
    width: { size: infoWidth, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      spread(
        [new TextRun({ text: document.title, bold: true, size: 36 })],
        document.date,
        infoWidth - 200,
        24,
      ),
      spread(
        [new TextRun({ text: document.band, size: 24 })],
        headerSummary(document),
        infoWidth - 200,
        24,
      ),
    ],
  });
  const cells = logo
    ? [
        new TableCell({
          width: { size: logoWidth, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              children: [
                new ImageRun({ type: "png", data: logo.png, transformation: logoSize(logo) }),
              ],
            }),
          ],
        }),
        info,
      ]
    : [info];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: logo ? [logoWidth, infoWidth] : [infoWidth],
    borders: NO_BORDERS,
    rows: [new TableRow({ children: cells })],
  });
}

function songLine(song: ExportSong, document: ExportDocument) {
  const details = [
    song.artist,
    song.energy === null ? null : EXPORT_TEXTS[document.language].energy(song.energy),
    song.tempo,
    song.key,
    song.duration,
  ].filter((detail): detail is string => detail !== null);
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${song.index}. `, size: 24 }),
      new TextRun({ text: song.title, bold: true, size: 24 }),
      new TextRun({ text: details.map((detail) => ` - ${detail}`).join(""), size: 22 }),
    ],
  });
}

function part(part: ExportPart, document: ExportDocument) {
  return [
    new Paragraph({
      spacing: { before: 360, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
      children: [
        new TextRun({ text: part.name, bold: true, size: 28 }),
        ...(part.duration ? [new TextRun({ text: `\t${part.duration}`, size: 24 })] : []),
      ],
    }),
    ...part.songs.map((song) => songLine(song, document)),
  ];
}

/**
 * The docx export (#297): a raw export to edit, no page layout. The main header (logo, title,
 * duration, band, date), then each part's header and its songs, one line each; a footer on every
 * page saying when the file was made.
 */
export async function renderDocx(
  document: ExportDocument,
  { logo, generatedOn }: { logo: ExportLogo | null; generatedOn: string },
) {
  const file = new Document({
    title: document.title,
    creator: document.band,
    styles: { default: { document: { run: { font: "Arial" } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: {
              top: PAGE.margin,
              right: PAGE.margin,
              bottom: PAGE.margin,
              left: PAGE.margin,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: EXPORT_TEXTS[document.language].footer(generatedOn),
                    size: 16,
                    color: "666666",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [mainHeader(document, logo), ...document.parts.flatMap((p) => part(p, document))],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(file));
}

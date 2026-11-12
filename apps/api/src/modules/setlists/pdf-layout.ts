/**
 * Where each part of a printed setlist goes (brief 030, #298): pure logic, in points, so it is
 * tested apart from drawing. A4, the main header at the top of every page, every part whole on
 * one page: on one column when it fits, else on two (each song's details then on a small second
 * line), else on the next page; several parts share a page when they fit, a few lines apart when
 * there is room (`partSpace`), else closer (`partGap`). When a part fits nowhere even on two
 * columns, every size gets smaller (one scale for the whole document, so every page reads the
 * same).
 */

/** A4 in points, its margins, and the footer's band at the bottom. */
export const PAGE = { width: 595.28, height: 841.89, margin: 36, footer: 22 } as const;

/** The width text can use. */
export const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;

/** Space between two columns. */
export const COLUMN_GAP = 24;

/** The main header's height on every page (logo, title, band), its space after included. */
export const MAIN_HEADER_HEIGHT = 96;

/** Sizes at full scale: a song title is the largest text, the rest smaller. */
export const SIZES = {
  partName: 20,
  partDuration: 13,
  /** A part's header: its name and duration, a rule, and the space around. */
  partHeader: 40,
  /** The least space between two parts on the same page. */
  partGap: 14,
  /** The space between two parts on the same page when it has room: about two song lines. */
  partSpace: 56,
  songTitle: 20,
  songDetails: 12,
  /** A song on one column: its title and details on one line. */
  songLine: 28,
  /** A song on two columns: its title, then its details on a small second line. */
  songTwoLines: 44,
} as const;

/** The smallest scale before giving up shrinking (a part then runs past its page's bottom). */
export const MIN_SCALE = 0.55;
const SCALE_STEP = 0.05;

/** A part placed on a page: its top, its columns (1 or 2), and its songs per column. */
export type PlacedPart = { part: number; top: number; columns: 1 | 2; rows: number };

export type PdfLayout = { scale: number; pages: PlacedPart[][] };

/** The height a part takes with this many songs on this many columns. */
export function partHeight(songs: number, columns: 1 | 2, scale: number) {
  const rows = columns === 1 ? songs : Math.ceil(songs / 2);
  const line = columns === 1 ? SIZES.songLine : SIZES.songTwoLines;
  return (SIZES.partHeader + rows * line) * scale;
}

/** The area parts use on every page: under the main header, above the footer. */
export const AREA = {
  top: PAGE.margin + MAIN_HEADER_HEIGHT,
  bottom: PAGE.height - PAGE.margin - PAGE.footer,
} as const;

/** Whether each part fits a page on two columns at this scale. */
function fitsAt(songCounts: readonly number[], scale: number) {
  return songCounts.every((songs) => partHeight(songs, 2, scale) <= AREA.bottom - AREA.top);
}

/** The largest scale at which every part fits a page, down to MIN_SCALE. */
export function layoutScale(songCounts: readonly number[]) {
  let scale = 1;
  while (scale > MIN_SCALE && !fitsAt(songCounts, scale)) {
    scale = Math.round((scale - SCALE_STEP) * 100) / 100;
  }
  return Math.max(scale, MIN_SCALE);
}

/** Places each part, given its number of songs, on pages and columns. */
export function layoutSetlist(songCounts: readonly number[]): PdfLayout {
  const scale = layoutScale(songCounts);
  const pages: PlacedPart[][] = [[]];
  let page = 0;
  // The bottom of the page's last part (its top before the first one).
  let y = AREA.top;
  songCounts.forEach((songs, part) => {
    const push = (columns: 1 | 2, top: number) => {
      pages[page]?.push({ part, top, columns, rows: columns === 1 ? songs : Math.ceil(songs / 2) });
      y = top + partHeight(songs, columns, scale);
    };
    const place = (columns: 1 | 2) => {
      const height = partHeight(songs, columns, scale);
      // After another part: a few lines apart when there is room, else closer.
      const gaps = pages[page]?.length ? [SIZES.partSpace, SIZES.partGap] : [0];
      const gap = gaps.find((space) => y + space * scale + height <= AREA.bottom);
      if (gap === undefined) return false;
      push(columns, y + gap * scale);
      return true;
    };
    // Two columns only for a part long enough to need them.
    if (place(1) || (songs > 1 && place(2))) return;
    if (pages[page]?.length) {
      page += 1;
      pages.push([]);
      y = AREA.top;
    }
    if (place(1) || (songs > 1 && place(2))) return;
    // Too long even at the smallest scale: on two columns anyway, past the page's bottom.
    push(2, y);
  });
  return { scale, pages };
}

/**
 * The longest start of `text` that fits `width` with "…" (all of it when it fits), or "" when
 * not even one letter does. `measure` gives a text's width.
 */
export function fitText(text: string, width: number, measure: (text: string) => number) {
  if (measure(text) <= width) return text;
  const characters = [...text];
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${characters.slice(0, middle).join("").trimEnd()}…`) <= width) low = middle;
    else high = middle - 1;
  }
  return low === 0 ? "" : `${characters.slice(0, low).join("").trimEnd()}…`;
}

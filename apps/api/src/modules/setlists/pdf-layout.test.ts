import { describe, expect, test } from "bun:test";
import { fitText, layoutScale, layoutSetlist, MIN_SCALE, PAGE, partHeight } from "./pdf-layout";

/** Where each part went: its page and columns. */
const placesOf = (songCounts: number[]) => {
  const { scale, pages } = layoutSetlist(songCounts);
  return {
    scale,
    places: pages.flatMap((parts, page) =>
      parts.map((part) => ({ part: part.part, page, columns: part.columns })),
    ),
  };
};

describe("layoutSetlist", () => {
  test("a short setlist: one page, one column each, full size", () => {
    expect(placesOf([8, 6])).toEqual({
      scale: 1,
      places: [
        { part: 0, page: 0, columns: 1 },
        { part: 1, page: 0, columns: 1 },
      ],
    });
  });

  test("a long first set on two columns, then the next ones share the second page", () => {
    expect(placesOf([24, 12, 10]).places).toEqual([
      { part: 0, page: 0, columns: 2 },
      { part: 1, page: 1, columns: 1 },
      { part: 2, page: 1, columns: 1 },
    ]);
  });

  test("two columns rather than a new page when that keeps the part on this page", () => {
    expect(placesOf([10, 12]).places).toEqual([
      { part: 0, page: 0, columns: 1 },
      { part: 1, page: 0, columns: 2 },
    ]);
  });

  test("a part is never split: it goes whole to the next page", () => {
    const { places } = placesOf([20, 20]);
    expect(places).toEqual([
      { part: 0, page: 0, columns: 1 },
      { part: 1, page: 1, columns: 1 },
    ]);
  });

  test("five parts: each whole, pages shared", () => {
    const { pages } = layoutSetlist([10, 10, 10, 10, 10]);
    expect(pages.flat().map((part) => part.part)).toEqual([0, 1, 2, 3, 4]);
    for (const page of pages) {
      for (const part of page) {
        const bottom = part.top + partHeight(10, part.columns, 1);
        expect(bottom).toBeLessThanOrEqual(PAGE.height - PAGE.margin - PAGE.footer);
      }
    }
  });

  test("a 50-song part only fits smaller: the whole setlist shrinks, never below MIN_SCALE", () => {
    const { scale, places } = placesOf([50]);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(places).toEqual([{ part: 0, page: 0, columns: 2 }]);
    expect(layoutScale([12, 50])).toBeGreaterThan(scale);
  });

  test("an empty part takes only its header", () => {
    expect(placesOf([0]).places).toEqual([{ part: 0, page: 0, columns: 1 }]);
  });
});

describe("fitText", () => {
  const measure = (text: string) => text.length * 10;

  test("kept whole when it fits", () => {
    expect(fitText("Africa", 60, measure)).toBe("Africa");
  });

  test("cut with an ellipsis, without a space before it", () => {
    expect(fitText("Black Hole Sun", 70, measure)).toBe("Black…");
  });

  test("nothing when not even a letter fits", () => {
    expect(fitText("Linger", 15, measure)).toBe("");
  });
});

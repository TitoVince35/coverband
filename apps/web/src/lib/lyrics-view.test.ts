import { expect, test } from "bun:test";
import { DEFAULT_LYRICS_SIZE, LYRICS_SIZES, parseLyricsSize, stepLyricsSize } from "./lyrics-view";

test("a stored size is kept only if it's one of the sizes", () => {
  expect(parseLyricsSize("32")).toBe(32);
  expect(parseLyricsSize("33")).toBe(DEFAULT_LYRICS_SIZE);
  expect(parseLyricsSize(null)).toBe(DEFAULT_LYRICS_SIZE);
  expect(parseLyricsSize("big")).toBe(DEFAULT_LYRICS_SIZE);
});

test("steps up and down, never past the ends", () => {
  expect(stepLyricsSize(26, 1)).toBe(32);
  expect(stepLyricsSize(26, -1)).toBe(22);
  expect(stepLyricsSize(LYRICS_SIZES[0], -1)).toBe(LYRICS_SIZES[0]);
  expect(stepLyricsSize(48, 1)).toBe(48);
});

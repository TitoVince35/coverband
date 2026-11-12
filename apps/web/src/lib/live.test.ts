import { expect, test } from "bun:test";
import { playingOrder } from "./live";

test("playingOrder: every song in order, across parts, empty parts skipped", () => {
  const order = playingOrder([{ songs: ["a", "b"] }, { songs: [] }, { songs: ["c", "a"] }]);
  expect(order).toEqual([
    { part: 0, index: 0, song: "a" },
    { part: 0, index: 1, song: "b" },
    { part: 2, index: 0, song: "c" },
    { part: 2, index: 1, song: "a" },
  ]);
  expect(playingOrder([])).toEqual([]);
});

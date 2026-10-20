import { expect, test } from "bun:test";
import { encodingsFor, fitWithin, sizesFrom } from "./logo";

test("fitWithin keeps the whole image and its shape, never upscaled", () => {
  // Horizontal, square, vertical: the longest side becomes the limit.
  expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 });
  expect(fitWithin(3000, 3000, 2000)).toEqual({ width: 2000, height: 2000 });
  expect(fitWithin(600, 1200, 256)).toEqual({ width: 128, height: 256 });
  // Smaller than the limit: unchanged.
  expect(fitWithin(800, 300, 2000)).toEqual({ width: 800, height: 300 });
  // A very thin image keeps at least one pixel.
  expect(fitWithin(10000, 1, 256)).toEqual({ width: 256, height: 1 });
});

test("sizesFrom tries the largest size first", () => {
  expect(sizesFrom(2000)).toEqual([2000, 1500, 1000]);
});

test("encodingsFor keeps transparency: JPEG only for opaque images", () => {
  expect(encodingsFor(false).map((e) => e.type)).toEqual(["image/webp", "image/png"]);
  expect(encodingsFor(true).map((e) => e.type)).toEqual(["image/webp", "image/png", "image/jpeg"]);
});

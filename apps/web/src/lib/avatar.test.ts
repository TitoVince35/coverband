import { expect, test } from "bun:test";
import { centeredSquare } from "./avatar";

test("crops the centered square and never upscales", () => {
  expect(centeredSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000, size: 512 });
  expect(centeredSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080, size: 512 });
  expect(centeredSquare(200, 300)).toEqual({ sx: 0, sy: 50, side: 200, size: 200 });
});

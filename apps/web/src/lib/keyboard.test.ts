import { expect, test } from "bun:test";
import { isKeyboardUp } from "./keyboard";

test("isKeyboardUp: the visible height well under the tallest seen", () => {
  expect(isKeyboardUp(839, 839)).toBe(false);
  // The browser's toolbar coming and going is no keyboard.
  expect(isKeyboardUp(780, 839)).toBe(false);
  expect(isKeyboardUp(450, 839)).toBe(true);
});

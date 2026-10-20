import { describe, expect, test } from "bun:test";
import { installMode, isIos } from "./install";

describe("installMode", () => {
  const base = { installed: false, dismissed: false, canPrompt: false, ios: false };

  test("the browser's prompt when it has one, else the iPhone steps on an iPhone", () => {
    expect(installMode({ ...base, canPrompt: true })).toBe("prompt");
    expect(installMode({ ...base, ios: true })).toBe("ios");
    expect(installMode(base)).toBeNull();
  });

  test("nothing once installed or dismissed", () => {
    expect(installMode({ ...base, canPrompt: true, installed: true })).toBeNull();
    expect(installMode({ ...base, ios: true, dismissed: true })).toBeNull();
  });
});

describe("isIos", () => {
  test("iPhone and iPad, which calls itself a Mac with a touch screen", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 14; Pixel 7)", 5)).toBe(false);
  });
});

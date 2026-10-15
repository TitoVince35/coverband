import { describe, expect, test } from "bun:test";
import { DEFAULT_THEME, parseTheme, resolveTheme } from "./theme";

describe("parseTheme", () => {
  test("keeps valid values", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
  });

  test("defaults to dark for missing or unknown values", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme("blue")).toBe("dark");
  });
});

describe("resolveTheme", () => {
  test("explicit choices ignore the system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("system follows the device preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

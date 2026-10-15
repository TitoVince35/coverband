import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "@coverband/shared";
import { pickLanguage } from "./languages";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translations", () => {
  test("French has exactly the same keys as English", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });

  test("every API error code is translated", () => {
    for (const code of ERROR_CODES) {
      expect(en.errors).toHaveProperty(code);
    }
  });

  test("no translation is empty", () => {
    for (const locale of [en, fr]) {
      for (const key of keys(locale)) {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], locale);
        expect(value, key).not.toBe("");
      }
    }
  });
});

describe("pickLanguage", () => {
  test("matches on the base language", () => {
    expect(pickLanguage(["fr-FR", "en-US"])).toBe("fr");
    expect(pickLanguage(["en-GB"])).toBe("en");
  });

  test("skips unsupported languages", () => {
    expect(pickLanguage(["de-DE", "fr-CA"])).toBe("fr");
  });

  test("defaults to English", () => {
    expect(pickLanguage(["de-DE", "es"])).toBe("en");
    expect(pickLanguage([])).toBe("en");
  });
});

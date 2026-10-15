import { describe, expect, test } from "bun:test";
import { displayName, slugify } from "./bands";

describe("slugify", () => {
  test("lowercases, strips accents and joins words with dashes", () => {
    expect(slugify("Les Rockeurs d'Été")).toBe("les-rockeurs-d-ete");
    expect(slugify("  The   Cover  Band  ")).toBe("the-cover-band");
    expect(slugify("Simon & Garfunkel")).toBe("simon-and-garfunkel");
    expect(slugify("AC/DC Tribute #2")).toBe("ac-dc-tribute-2");
  });

  test("falls back when nothing usable is left, and stays short", () => {
    expect(slugify("!!!")).toBe("band");
    expect(slugify("a".repeat(80))).toHaveLength(50);
    expect(slugify(`${"a".repeat(49)} b`)).toBe("a".repeat(49));
  });
});

describe("displayName", () => {
  test("prefers the nickname", () => {
    expect(displayName({ firstName: "Jean", lastName: "Dupont", nickname: "JD" })).toBe("JD");
    expect(displayName({ firstName: "Jean", lastName: "Dupont", nickname: " " })).toBe(
      "Jean Dupont",
    );
    expect(displayName({ firstName: "Jean", lastName: "Dupont" })).toBe("Jean Dupont");
  });
});

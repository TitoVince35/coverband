import { describe, expect, test } from "bun:test";
import { isMusicalKey, keyLabel, keyShort, MUSICAL_KEYS } from "./keys";

describe("musical keys", () => {
  test("24 keys, each spelled once", () => {
    expect(MUSICAL_KEYS).toHaveLength(24);
    expect(new Set(MUSICAL_KEYS).size).toBe(24);
    expect(isMusicalKey("C#m")).toBe(true);
    expect(isMusicalKey("Dbm")).toBe(false);
    expect(isMusicalKey("H")).toBe(false);
  });

  test("in words, in both languages", () => {
    expect(keyLabel("Em", "en")).toBe("E minor");
    expect(keyLabel("Db", "en")).toBe("D♭ major");
    expect(keyLabel("Em", "fr")).toBe("Mi mineur");
    expect(keyLabel("F#m", "fr")).toBe("Fa♯ mineur");
    expect(keyLabel("Bb", "fr")).toBe("Si♭ majeur");
  });

  test("in chord notation", () => {
    expect(keyShort("Em")).toBe("Em");
    expect(keyShort("Db")).toBe("D♭");
    expect(keyShort("C#m")).toBe("C♯m");
  });
});

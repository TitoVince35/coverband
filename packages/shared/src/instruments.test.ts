import { describe, expect, test } from "bun:test";
import {
  INSTRUMENT_NAMES,
  INSTRUMENTS,
  instrumentLabel,
  matchInstrument,
  normalizeName,
  searchInstruments,
  toInstrument,
} from "./instruments";
import { LANGUAGES } from "./languages";

describe("instruments catalogue", () => {
  test("every instrument has a label in every language", () => {
    for (const code of INSTRUMENTS) {
      for (const language of Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]) {
        expect(INSTRUMENT_NAMES[code][language][0], `${code} ${language}`).toBeTruthy();
      }
    }
  });

  test("no name points to two instruments", () => {
    const seen = new Map<string, string>();
    for (const code of INSTRUMENTS) {
      for (const name of Object.values(INSTRUMENT_NAMES[code]).flat()) {
        const key = normalizeName(name);
        const other = seen.get(key);
        expect(other === undefined || other === code, `"${name}": ${other} and ${code}`).toBe(true);
        seen.set(key, code);
      }
    }
  });
});

describe("matching typed text", () => {
  test("in any language, ignoring case, accents and spacing", () => {
    expect(matchInstrument("guitare")).toBe("guitar");
    expect(matchInstrument("  Basse ")).toBe("bass_guitar");
    expect(matchInstrument("BASS")).toBe("bass_guitar");
    expect(matchInstrument("chant")).toBe("vocals");
    expect(matchInstrument("Choeurs")).toBe("vocals");
    expect(matchInstrument("keys")).toBe("keyboards");
    expect(matchInstrument("ukulele")).toBe("ukulele");
    expect(matchInstrument("Cor d’harmonie")).toBe("french_horn");
  });

  test("unknown text stays free text, tidied", () => {
    expect(matchInstrument("Theremin")).toBeNull();
    expect(toInstrument("  Theremin   électrique ")).toEqual({ label: "Theremin électrique" });
    expect(toInstrument("batterie")).toEqual({ code: "drums" });
  });

  test("labels follow the language; free text is shown as typed", () => {
    expect(instrumentLabel({ code: "bass_guitar" }, "en")).toBe("Bass guitar");
    expect(instrumentLabel({ code: "bass_guitar" }, "fr")).toBe("Basse");
    expect(instrumentLabel({ label: "Theremin" }, "fr")).toBe("Theremin");
  });
});

describe("searching for the picker", () => {
  test("an empty query lists everything, alphabetically in the language", () => {
    const all = searchInstruments("", "fr");
    expect(all).toHaveLength(INSTRUMENTS.length);
    expect(all.slice(0, 3)).toEqual(["accordion", "banjo", "bass_guitar"]);
  });

  test("filters by any name, labels starting with the query first", () => {
    // Banjo, Basse, Batterie start with "ba"; Contrebasse, Tuba... contain it.
    const ba = searchInstruments("ba", "fr");
    expect(ba.slice(0, 3)).toEqual(["banjo", "bass_guitar", "drums"]);
    expect(ba).toContain("upright_bass");
    expect(searchInstruments("bass", "en")[0]).toBe("bass_guitar");
    expect(searchInstruments("synth", "fr")).toEqual(["keyboards"]);
    expect(searchInstruments("zzz", "en")).toEqual([]);
  });
});

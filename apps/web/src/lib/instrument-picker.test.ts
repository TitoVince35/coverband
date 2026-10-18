import { describe, expect, test } from "bun:test";
import { INSTRUMENTS } from "@coverband/shared";
import { pickerOptions } from "./instrument-picker";

const labels = (options: ReturnType<typeof pickerOptions>) => options.map((o) => o.label);

describe("instrument picker options", () => {
  test("nothing typed: every instrument, then other bands' free text", () => {
    const options = pickerOptions("", "en", ["Theremin"]);
    expect(options).toHaveLength(INSTRUMENTS.length + 1);
    expect(options.at(-1)).toEqual({ instrument: { label: "Theremin" }, label: "Theremin" });
  });

  test("typing filters, in both languages, labels in the app's language", () => {
    expect(labels(pickerOptions("bass", "fr")).slice(0, 2)).toEqual(["Basse", "Contrebasse"]);
    expect(labels(pickerOptions("basse", "en"))).toContain("Bass guitar");
  });

  test("text naming nothing listed can be kept as a custom instrument", () => {
    expect(pickerOptions("Kazoo", "en", ["Theremin"])).toEqual([
      { instrument: { label: "Kazoo" }, label: "Kazoo", custom: true },
    ]);
    // A known instrument or a listed free-text one: no custom option.
    expect(pickerOptions("guitare", "en").some((o) => o.custom)).toBe(false);
    expect(pickerOptions("theremin", "en", ["Theremin"]).some((o) => o.custom)).toBe(false);
  });

  test("already chosen instruments are left out", () => {
    const options = pickerOptions(
      "",
      "en",
      ["Theremin"],
      [{ code: "guitar" }, { label: "theremin" }],
    );
    expect(options.some((o) => "code" in o.instrument && o.instrument.code === "guitar")).toBe(
      false,
    );
    expect(labels(options)).not.toContain("Theremin");
    expect(pickerOptions("guitar", "en", [], [{ code: "guitar" }]).some((o) => o.custom)).toBe(
      false,
    );
  });

  test("other bands' free text naming a known instrument is not listed twice", () => {
    expect(labels(pickerOptions("", "en", ["Choeurs"]))).not.toContain("Choeurs");
  });
});

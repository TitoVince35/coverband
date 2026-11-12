import { describe, expect, test } from "bun:test";
import type { DocumentKind, Instrument, Language } from "@coverband/shared";
import { liveDocuments, sameInstrument, shortTitle } from "./live-documents";

const doc = (
  id: string,
  title: string,
  instruments: Instrument[] = [],
  kind: DocumentKind = "photo",
) => ({ id, title, kind, instruments });

const guitar: Instrument = { code: "guitar" };
const bass: Instrument = { code: "bass_guitar" };
const options = {
  mine: [bass],
  all: false,
  canOpen: (_id: string) => true,
  language: "en" as Language,
};
const labels = (documents: ReturnType<typeof doc>[], more: Partial<typeof options> = {}) =>
  liveDocuments(documents, { ...options, ...more }).map((entry) => entry.label);

describe("liveDocuments", () => {
  test("photos only: no PDF, Guitar Pro nor MuseScore", () => {
    expect(
      labels([
        doc("1", "Chart", [], "pdf"),
        doc("2", "Tab", [], "guitarpro"),
        doc("3", "Score", [], "musescore"),
        doc("4", "Setlist"),
      ]),
    ).toEqual(["Setlist"]);
  });

  test("my instruments' and untagged ones; every one with `all`", () => {
    const documents = [doc("1", "Riff", [guitar]), doc("2", "Line", [bass]), doc("3", "Chords")];
    expect(labels(documents)).toEqual(["Bass guitar", "Chords"]);
    expect(labels(documents, { all: true })).toEqual(["Guitar", "Bass guitar", "Chords"]);
  });

  test("only what the phone can open now", () => {
    expect(labels([doc("1", "A"), doc("2", "B")], { canOpen: (id) => id === "2" })).toEqual(["B"]);
  });

  test("tagged with several instruments: mine shows", () => {
    expect(labels([doc("1", "Both", [guitar, bass])])).toEqual(["Bass guitar"]);
  });

  test("two buttons reading the same get their short titles", () => {
    expect(
      labels([doc("1", "Verse groove", [bass]), doc("2", "Chorus and bridge", [bass])]),
    ).toEqual(["Bass guitar · Verse groove", "Bass guitar · Chorus and…"]);
  });

  test("in French, free-text instruments as typed", () => {
    expect(
      labels([doc("1", "A", [{ label: "Ukulélé" }]), doc("2", "B", [bass])], {
        all: true,
        language: "fr",
      }),
    ).toEqual(["Ukulélé", "Basse"]);
  });
});

test("shortTitle: about 12 characters, cut with an ellipsis", () => {
  expect(shortTitle("Grille")).toBe("Grille");
  // Twelve characters stay whole, spaces around dropped.
  expect(shortTitle("  Twelve chars  ")).toBe("Twelve chars");
  expect(shortTitle("Chorus and bridge")).toBe("Chorus and…");
});

test("sameInstrument: by code, or free text whatever its case", () => {
  expect(sameInstrument(guitar, { code: "guitar" })).toBe(true);
  expect(sameInstrument({ label: "Kazoo" }, { label: "kazoo" })).toBe(true);
  expect(sameInstrument(guitar, { label: "guitar" })).toBe(false);
});

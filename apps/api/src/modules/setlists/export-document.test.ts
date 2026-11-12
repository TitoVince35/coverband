import { describe, expect, test } from "bun:test";
import {
  type ExportSource,
  exportDocument,
  exportFingerprint,
  isTimeZone,
} from "./export-document";

const song = (
  title: string,
  more: Partial<ExportSource["parts"][number]["songs"][number]> = {},
) => ({
  title,
  artist: `${title} artist`,
  standardDuration: 200,
  ownDuration: null,
  energy: null,
  key: null,
  bandKey: null,
  ...more,
});

const source: ExportSource = {
  title: "Wedding",
  // Half past midnight in Paris: already the 12th there, still the 11th in UTC.
  updatedAt: new Date("2026-11-11T23:30:00Z"),
  band: { name: "The Covers", logoKey: "bands/1/logo/a.png" },
  parts: [
    {
      name: "Set 1",
      songs: [
        song("Rock", {
          ownDuration: 245,
          standardDuration: 300,
          energy: 3,
          key: "C",
          bandKey: "D",
        }),
        song("Ballad", { key: "Em" }),
      ],
    },
    { name: null, songs: [song("Encore", { standardDuration: null })] },
  ],
};

const paris = { language: "en", timeZone: "Europe/Paris" } as const;

describe("exportDocument", () => {
  test("the header: title, total duration with the songs missing one, band, date", () => {
    const document = exportDocument(source, paris);
    expect(document).toMatchObject({
      language: "en",
      title: "Wedding",
      duration: "7 min (1 song without a duration)",
      band: "The Covers",
      date: "November 12, 2026",
      logoKey: "bands/1/logo/a.png",
    });
  });

  test("the date is in the requester's time zone", () => {
    expect(exportDocument(source, { language: "en", timeZone: "UTC" }).date).toBe(
      "November 11, 2026",
    );
  });

  test("songs: index in the part, the band's key and duration first", () => {
    const [first, second] = exportDocument(source, paris).parts;
    expect(first?.name).toBe("Set 1");
    expect(first?.duration).toBe("7 min");
    expect(first?.songs).toEqual([
      { index: 1, title: "Rock", artist: "Rock artist", energy: 3, key: "D", duration: "4:05" },
      {
        index: 2,
        title: "Ballad",
        artist: "Ballad artist",
        energy: null,
        key: "Em",
        duration: "3:20",
      },
    ]);
    expect(second?.songs[0]).toMatchObject({ index: 1, key: null, duration: null });
  });

  test("a part without a name is numbered; one without songs has no duration", () => {
    const empty = { ...source, parts: [...source.parts, { name: null, songs: [] }] };
    const parts = exportDocument(empty, paris).parts;
    expect(parts.map((part) => part.name)).toEqual(["Set 1", "Part 2", "Part 3"]);
    expect(parts[1]?.duration).toBe("0 min (1 song without a duration)");
    expect(parts[2]?.duration).toBeNull();
  });

  test("hours and minutes, in French", () => {
    const long = {
      ...source,
      parts: [{ name: null, songs: Array.from({ length: 20 }, (_, i) => song(`S${i}`)) }],
    };
    const document = exportDocument(long, { language: "fr", timeZone: "Europe/Paris" });
    expect(document.duration).toBe("1 h 7 min");
    expect(document.parts[0]?.name).toBe("Partie 1");
    expect(document.date).toBe("12 novembre 2026");
    expect(exportDocument(source, { language: "fr", timeZone: "Europe/Paris" }).duration).toBe(
      "7 min (1 morceau sans durée)",
    );
  });

  test("a setlist without songs has no duration", () => {
    expect(
      exportDocument({ ...source, parts: [{ name: null, songs: [] }] }, paris).duration,
    ).toBeNull();
  });
});

describe("exportFingerprint", () => {
  const document = exportDocument(source, paris);

  test("the same document and format, the same fingerprint", () => {
    expect(exportFingerprint(exportDocument(source, paris), "docx")).toBe(
      exportFingerprint(document, "docx"),
    );
  });

  test("anything shown changes it: a song's title, the logo, the language", () => {
    const fingerprint = exportFingerprint(document, "docx");
    const renamed = structuredClone(source);
    const first = renamed.parts[0]?.songs[0];
    if (first) first.title = "Rock!";
    expect(exportFingerprint(exportDocument(renamed, paris), "docx")).not.toBe(fingerprint);
    const newLogo = { ...source, band: { ...source.band, logoKey: "bands/1/logo/b.png" } };
    expect(exportFingerprint(exportDocument(newLogo, paris), "docx")).not.toBe(fingerprint);
    const french = exportDocument(source, { language: "fr", timeZone: "Europe/Paris" });
    expect(exportFingerprint(french, "docx")).not.toBe(fingerprint);
  });
});

test("isTimeZone", () => {
  expect(isTimeZone("Europe/Paris")).toBe(true);
  expect(isTimeZone("America/Martinique")).toBe(true);
  expect(isTimeZone("Mars/Olympus")).toBe(false);
});

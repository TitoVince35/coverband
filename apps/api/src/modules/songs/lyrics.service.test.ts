import { expect, test } from "bun:test";
import type { LyricsEntry } from "../../adapters/lyrics";
import { rankLyrics } from "./lyrics.service";

const entry = (id: string, duration: number | null, lyrics: string | null): LyricsEntry => ({
  id,
  title: "Zombie",
  artist: "The Cranberries",
  album: `Album ${id}`,
  duration,
  lyrics,
});

test("each text once, the version closest to the song's duration", () => {
  const matches = rankLyrics(
    [
      entry("live", 82, "Another head hangs lowly"),
      entry("album", 306, "Another head hangs lowly"),
      entry("compilation", 315, "ANOTHER  head hangs lowly\n"),
      entry("other", 240, "In your head, in your head"),
    ],
    307,
  );
  expect(matches.map((m) => m.id)).toEqual(["album", "other"]);
  expect(matches[0]).toEqual({
    id: "album",
    album: "Album album",
    duration: 306,
    lyrics: "Another head hangs lowly",
  });
});

test("no lyrics, blank or too long: left out", () => {
  const matches = rankLyrics(
    [entry("1", 300, null), entry("2", 300, "  "), entry("3", 300, "a".repeat(10_001))],
    300,
  );
  expect(matches).toEqual([]);
});

test("without durations, the provider's order; five at most", () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(String(i), null, `Lyrics ${i}`));
  expect(rankLyrics(entries, 300).map((m) => m.id)).toEqual(["0", "1", "2", "3", "4"]);
  expect(rankLyrics(entries, null)).toHaveLength(5);
});

import { normalizeName, SONG_MAX_LENGTH } from "@coverband/shared";
import type { LyricsEntry, LyricsProvider } from "../../adapters/lyrics";
import type { Db } from "../../core/db/client";
import { getSong } from "./service";

/** Lyrics found for a song, offered to choose from. */
export type LyricsMatch = {
  id: string;
  album: string | null;
  duration: number | null;
  lyrics: string;
};

/** How many matches a search offers at most. */
export const LYRICS_MATCHES = 5;

/** The same lyrics, however they're spaced or capitalised. */
const sameLyrics = (lyrics: string) => lyrics.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The matches worth offering (#130): entries with lyrics that fit the song's field, each text
 * once (the version closest in duration), closest to the song's original duration first.
 */
export function rankLyrics(
  entries: readonly LyricsEntry[],
  duration: number | null,
  limit = LYRICS_MATCHES,
): LyricsMatch[] {
  const distance = (entry: LyricsEntry) =>
    duration === null || entry.duration === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(entry.duration - duration);
  const best = new Map<string, LyricsEntry & { lyrics: string }>();
  for (const entry of entries) {
    const lyrics = entry.lyrics?.trim();
    if (!lyrics || lyrics.length > SONG_MAX_LENGTH.lyrics) continue;
    const key = sameLyrics(lyrics);
    const kept = best.get(key);
    if (!kept || distance(entry) < distance(kept)) best.set(key, { ...entry, lyrics });
  }
  return [...best.values()]
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, limit)
    .map(({ id, album, duration, lyrics }) => ({ id, album, duration, lyrics }));
}

/**
 * Whether the provider only knows the song as an instrumental: every entry with the song's title
 * says so. Entries for other titles (a fuzzy search's karaoke versions) don't count.
 */
export function onlyInstrumental(entries: readonly LyricsEntry[], title: string): boolean {
  const same = entries.filter((entry) => normalizeName(entry.title) === normalizeName(title));
  return same.length > 0 && same.every((entry) => entry.instrumental);
}

/**
 * Searches a band's song's lyrics online: the matches, and whether the provider only knows it as
 * an instrumental (`onlyInstrumental`). Null when the band has no such song.
 */
export async function searchLyrics(
  db: Db,
  provider: LyricsProvider,
  bandId: string,
  songId: string,
) {
  const song = await getSong(db, bandId, songId);
  if (!song) return null;
  const entries = await provider.search({ title: song.title, artist: song.artist });
  return {
    matches: rankLyrics(entries, song.standardDuration),
    instrumental: onlyInstrumental(entries, song.title),
  };
}

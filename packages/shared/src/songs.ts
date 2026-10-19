import { normalizeName } from "./instruments";

/** Length limits for song fields, shared by the API and the forms. */
export const SONG_MAX_LENGTH = {
  title: 100,
  artist: 100,
  style: 50,
  notes: 2000,
  lyrics: 10_000,
} as const;

/** Where a song's lyrics come from: fetched from LRCLIB, or typed by a member. */
export const LYRICS_SOURCES = ["lrclib", "typed"] as const;
export type LyricsSource = (typeof LYRICS_SOURCES)[number];

/** Where the band is with a song; a new song starts as proposed. */
export const SONG_STATUSES = ["proposed", "learning", "ready"] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

/** Energy is rated from 1 to this many chili peppers (null: not rated). */
export const MAX_ENERGY = 3;

/** Tempo range accepted, in beats per minute. */
export const SONG_TEMPO = { min: 20, max: 400 } as const;

/**
 * What makes two songs the same for the duplicate warning: title and artist, ignoring case,
 * accents, punctuation and extra spaces. "Beatles" and "The Beatles" stay different.
 */
export function songKey(song: { title: string; artist: string }): string {
  return `${normalizeName(song.title)}|${normalizeName(song.artist)}`;
}

/** A song of the list with the same title and artist (the duplicate warning), if any. */
export function findDuplicateSong<S extends { id: string; title: string; artist: string }>(
  songs: readonly S[],
  song: { title: string; artist: string },
  /** The song being edited, which never duplicates itself. */
  exceptId?: string,
): S | undefined {
  const key = songKey(song);
  return songs.find((other) => other.id !== exceptId && songKey(other) === key);
}

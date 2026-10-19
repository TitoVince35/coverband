import { normalizeName } from "./instruments";

/** Length limits for song fields, shared by the API and the forms. */
export const SONG_MAX_LENGTH = {
  title: 100,
  artist: 100,
} as const;

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

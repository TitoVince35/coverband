// Setlists (brief 026): a band's ordered songs, in parts.

/** Length limits for a setlist's texts, shared by the API and the forms. */
export const SETLIST_MAX_LENGTH = { title: 100, partName: 50 } as const;

/**
 * How much a band keeps: current setlists per band (archived ones not counted), parts and songs
 * per setlist.
 */
export const SETLIST_LIMITS = { perBand: 50, parts: 5, songs: 50 } as const;

/** A song's durations, in seconds: the original, and the band's own. */
type Durations = { standardDuration: number | null; ownDuration: number | null };

/** The duration a setlist counts for a song: the band's own, else the original (brief 012). */
export const playedDuration = (song: Durations) => song.ownDuration ?? song.standardDuration;

/**
 * The duration of songs played in a row (a setlist, or one of its parts): their played durations
 * added up, in seconds, and how many songs have none (never guessed). Breaks and the gaps
 * between songs aren't counted.
 */
export function setlistDuration(songs: readonly Durations[]): { seconds: number; missing: number } {
  let seconds = 0;
  let missing = 0;
  for (const song of songs) {
    const duration = playedDuration(song);
    if (duration === null) missing += 1;
    else seconds += duration;
  }
  return { seconds, missing };
}

/** A duration in whole minutes, as hours and minutes ("1 h 52 min"), rounded to the minute. */
export function hoursAndMinutes(seconds: number): { hours: number; minutes: number } {
  const total = Math.round(seconds / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

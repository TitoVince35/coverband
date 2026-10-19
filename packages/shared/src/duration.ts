/**
 * Formats a duration in seconds as `m:ss`, or `h:mm:ss` from one hour.
 * Used for song, setlist part and setlist durations.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`Invalid duration: ${totalSeconds}`);
  }
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/** Longest song duration accepted (2 hours), in seconds. */
export const MAX_SONG_DURATION = 7200;

/**
 * Reads a typed duration: `m:ss` or `h:mm:ss` ("3:45", "12:05", "1:02:30"), spaces ignored.
 * Returns seconds, or null when it isn't a duration (seconds over 59, nothing typed...).
 */
export function parseDuration(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(text.replace(/\s+/g, ""));
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (Number(seconds) > 59 || (hours !== undefined && Number(minutes) > 59)) return null;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

// The full-screen lyrics view (#131): its text size, remembered on the device, and keeping the
// screen awake while it's open.
import { useEffect } from "react";

/** Text sizes in pixels, from a phone at arm's length to a music stand. */
export const LYRICS_SIZES = [18, 22, 26, 32, 40, 48] as const;
export const DEFAULT_LYRICS_SIZE = 26;
export const LYRICS_SIZE_STORAGE_KEY = "coverband-lyrics-size";

/** A stored size, or the default when it's missing or not one of the sizes. */
export function parseLyricsSize(value: string | null | undefined): number {
  const size = Number(value);
  return (LYRICS_SIZES as readonly number[]).includes(size) ? size : DEFAULT_LYRICS_SIZE;
}

/** The next size up (+1) or down (-1), staying within the sizes. */
export function stepLyricsSize(size: number, step: 1 | -1): number {
  const index = (LYRICS_SIZES as readonly number[]).indexOf(parseLyricsSize(String(size)));
  return LYRICS_SIZES[Math.min(LYRICS_SIZES.length - 1, Math.max(0, index + step))] ?? size;
}

export function readLyricsSize(): number {
  try {
    return parseLyricsSize(localStorage.getItem(LYRICS_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_LYRICS_SIZE;
  }
}

export function storeLyricsSize(size: number) {
  try {
    localStorage.setItem(LYRICS_SIZE_STORAGE_KEY, String(size));
  } catch {
    // Storage unavailable (private mode): the size lasts for this page only.
  }
}

/**
 * Keeps the screen on while `active` (Screen Wake Lock API, where the browser has it). The
 * browser drops the lock when the page is hidden: it's asked for again when it shows.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (done) await next.release();
        else lock = next;
      } catch {
        // Refused (battery saver, not visible): the screen may sleep, nothing else changes.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

import { AppError } from "../core/errors";

/** Lyrics found online for a song, as the provider gives them. */
export type LyricsEntry = {
  /** The provider's id for these lyrics. */
  id: string;
  title: string;
  artist: string;
  album: string | null;
  /** In seconds, when known. */
  duration: number | null;
  /** Plain text; null for an instrumental or an entry without plain lyrics. */
  lyrics: string | null;
  /** The provider says this recording has no lyrics. */
  instrumental: boolean;
};

/** What to search: a song by title and artist, or free text (#138: "Take Five Carmen McRae"). */
export type LyricsQuery = { title: string; artist: string } | { text: string };

/** Where lyrics are searched (#130): LRCLIB, or a fake in tests. */
export type LyricsProvider = {
  search(query: LyricsQuery): Promise<LyricsEntry[]>;
};

/**
 * The lyrics service doesn't answer (down, slow, refusing): the member types them in. Its cause
 * is logged by the app's `onError` (#208), never sent to the member.
 */
export class LyricsUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super("lyrics_unavailable", "The lyrics service is not available right now");
    this.cause = cause;
  }
}

type LrclibEntry = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
};

/** Answers worth asking again: LRCLIB says it's busy (503) or asks to slow down (429). */
const RETRIED_STATUSES = new Set([429, 502, 503, 504]);

/**
 * LRCLIB (lrclib.net): free, no key; it asks clients to name themselves in the User-Agent. Its
 * lyrics come from its community, without a licence from the rights holders (see
 * briefs/claude/014_lyrics.md). Nothing is cached: the server keeps no state.
 *
 * When it's overloaded, LRCLIB refuses part of the requests at random ("server busy"): a busy
 * answer or a network failure is asked again after each of `retryDelaysMs`.
 */
export function createLrclibProvider({
  userAgent,
  baseUrl = "https://lrclib.net",
  timeoutMs = 8000,
  retryDelaysMs = [400, 1000],
  fetch = globalThis.fetch,
}: {
  userAgent: string;
  baseUrl?: string;
  /** Per request. */
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  /** Tests pass their own. */
  fetch?: (url: URL, init: RequestInit) => Promise<Response>;
}): LyricsProvider {
  /** The answer, once LRCLIB isn't busy; throws when it never answers. */
  async function get(url: URL): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const delay = retryDelaysMs[attempt];
      try {
        const res = await fetch(url, {
          headers: { "user-agent": userAgent, accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok || !RETRIED_STATUSES.has(res.status) || delay === undefined) return res;
      } catch (error) {
        if (delay === undefined) throw error;
      }
      await Bun.sleep(delay);
    }
  }

  return {
    async search(query) {
      // Relative: a path in the base URL (a proxy) is kept.
      const url = new URL("api/search", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
      if ("text" in query) {
        url.searchParams.set("q", query.text);
      } else {
        url.searchParams.set("track_name", query.title);
        url.searchParams.set("artist_name", query.artist);
      }
      try {
        const res = await get(url);
        if (!res.ok) throw new Error(`LRCLIB answered ${res.status}`);
        const entries = (await res.json()) as LrclibEntry[];
        if (!Array.isArray(entries)) throw new Error("LRCLIB answered something else");
        // An answer of another shape throws here too: unavailable, never a 500.
        return entries.map((entry) => {
          const instrumental = entry.instrumental === true;
          return {
            id: String(entry.id),
            title: String(entry.trackName),
            artist: String(entry.artistName),
            album: typeof entry.albumName === "string" && entry.albumName ? entry.albumName : null,
            duration: typeof entry.duration === "number" ? Math.round(entry.duration) : null,
            instrumental,
            lyrics:
              instrumental || typeof entry.plainLyrics !== "string" || !entry.plainLyrics
                ? null
                : entry.plainLyrics,
          };
        });
      } catch (error) {
        throw new LyricsUnavailableError(error);
      }
    },
  };
}

/** Tests: answers with the given entries for every search, and remembers the searches. */
export function createMemoryLyricsProvider(entries: LyricsEntry[] = []) {
  const searches: LyricsQuery[] = [];
  const provider: LyricsProvider & {
    entries: LyricsEntry[];
    searches: typeof searches;
    down: boolean;
  } = {
    entries,
    searches,
    down: false,
    async search(query) {
      searches.push(query);
      if (provider.down) throw new LyricsUnavailableError(new Error("LRCLIB is down"));
      return provider.entries;
    },
  };
  return provider;
}

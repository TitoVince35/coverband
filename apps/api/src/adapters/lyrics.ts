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
};

/** Where lyrics are searched (#130): LRCLIB, or a fake in tests. */
export type LyricsProvider = {
  search(song: { title: string; artist: string }): Promise<LyricsEntry[]>;
};

/** The lyrics service doesn't answer (down, slow, refusing): the member types them in. */
export class LyricsUnavailableError extends AppError {
  constructor() {
    super("lyrics_unavailable", "The lyrics service is not available right now");
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

/**
 * LRCLIB (lrclib.net): free, no key; it asks clients to name themselves in the User-Agent. Its
 * lyrics come from its community, without a licence from the rights holders (see
 * briefs/claude/014_lyrics.md). Nothing is cached: the server keeps no state.
 */
export function createLrclibProvider({
  userAgent,
  baseUrl = "https://lrclib.net",
  timeoutMs = 8000,
}: {
  userAgent: string;
  baseUrl?: string;
  timeoutMs?: number;
}): LyricsProvider {
  return {
    async search({ title, artist }) {
      // Relative: a path in the base URL (a proxy) is kept.
      const url = new URL("api/search", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
      url.searchParams.set("track_name", title);
      url.searchParams.set("artist_name", artist);
      try {
        const res = await fetch(url, {
          headers: { "user-agent": userAgent, accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`LRCLIB answered ${res.status}`);
        const entries = (await res.json()) as LrclibEntry[];
        if (!Array.isArray(entries)) throw new Error("LRCLIB answered something else");
        // An answer of another shape throws here too: unavailable, never a 500.
        return entries.map((entry) => ({
          id: String(entry.id),
          title: String(entry.trackName),
          artist: String(entry.artistName),
          album: typeof entry.albumName === "string" && entry.albumName ? entry.albumName : null,
          duration: typeof entry.duration === "number" ? Math.round(entry.duration) : null,
          lyrics:
            entry.instrumental || typeof entry.plainLyrics !== "string" || !entry.plainLyrics
              ? null
              : entry.plainLyrics,
        }));
      } catch {
        throw new LyricsUnavailableError();
      }
    },
  };
}

/** Tests: answers with the given entries for every search, and remembers the searches. */
export function createMemoryLyricsProvider(entries: LyricsEntry[] = []) {
  const searches: { title: string; artist: string }[] = [];
  const provider: LyricsProvider & {
    entries: LyricsEntry[];
    searches: typeof searches;
    down: boolean;
  } = {
    entries,
    searches,
    down: false,
    async search(song) {
      searches.push(song);
      if (provider.down) throw new LyricsUnavailableError();
      return provider.entries;
    },
  };
  return provider;
}

import { songKey } from "@coverband/shared";

/** A song as a music catalog knows it (#199): its page, album, duration and genre. */
export type CatalogTrack = {
  /** The track's public page (a song link). */
  url: string;
  title: string;
  artist: string;
  album: string | null;
  /** In seconds, when known. */
  duration: number | null;
  /** The album's first genre, used as the song's style; null when the catalog has none. */
  genre: string | null;
};

/** Where a new song's details are looked up (#199): Deezer, or a fake in tests. */
export type MusicCatalog = {
  /** The best match, or null when nothing matches or the catalog doesn't answer. */
  findTrack(song: { title: string; artist: string }): Promise<CatalogTrack | null>;
};

type DeezerTrack = {
  id: number;
  title: string;
  link: string;
  duration: number;
  artist: { name: string };
  album: { id: number; title: string };
};

/**
 * Deezer's public API (api.deezer.com): free, no key, about 50 requests per 5 seconds per IP. A
 * search by artist and title, then the album for the genre. Best effort: any failure (down, slow,
 * refusing, another shape) is no match, never an error.
 */
export function createDeezerCatalog({
  baseUrl = "https://api.deezer.com",
  timeoutMs = 5000,
  fetch = globalThis.fetch,
}: {
  baseUrl?: string;
  /** Per request. */
  timeoutMs?: number;
  /** Tests pass their own. */
  fetch?: (url: URL, init: RequestInit) => Promise<Response>;
} = {}): MusicCatalog {
  // Relative: a path in the base URL (a proxy) is kept.
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  async function get(path: string, params: Record<string, string> = {}) {
    const url = new URL(path, base);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Deezer answered ${res.status}`);
    const body = (await res.json()) as { error?: unknown };
    // Deezer answers its errors (quota, unknown id) with a 200 and an `error` object.
    if (body.error) throw new Error("Deezer refused");
    return body;
  }

  return {
    async findTrack(song) {
      try {
        // A plain search: Deezer's advanced syntax (artist:"…" track:"…") finds nothing.
        const { data } = (await get("search", {
          q: `${song.artist} ${song.title}`,
          limit: "10",
        })) as { data?: DeezerTrack[] };
        const tracks = Array.isArray(data) ? data : [];
        // The same title and artist (case, accents and punctuation aside) first, then the same
        // artist, else Deezer's first.
        const wanted = songKey(song);
        const artist = songKey({ title: "", artist: song.artist });
        const track =
          tracks.find((t) => songKey({ title: t.title, artist: t.artist.name }) === wanted) ??
          tracks.find((t) => songKey({ title: "", artist: t.artist.name }) === artist) ??
          tracks[0];
        if (!track) return null;
        return {
          url: String(track.link),
          title: String(track.title),
          artist: String(track.artist.name),
          album: track.album?.title ? String(track.album.title) : null,
          duration:
            typeof track.duration === "number" && track.duration > 0 ? track.duration : null,
          genre: await genreOf(track.album?.id),
        };
      } catch {
        return null;
      }
    },
  };

  /** The album's first genre; null when unknown (the track is still a match). */
  async function genreOf(albumId: number | undefined) {
    if (typeof albumId !== "number") return null;
    try {
      const album = (await get(`album/${albumId}`)) as { genres?: { data?: { name: string }[] } };
      const name = album.genres?.data?.[0]?.name;
      return typeof name === "string" && name ? name : null;
    } catch {
      return null;
    }
  }
}

/** Tests: answers with the given track for every search, and remembers the searches. */
export function createMemoryCatalog(track: CatalogTrack | null = null) {
  const searches: { title: string; artist: string }[] = [];
  const catalog: MusicCatalog & { track: CatalogTrack | null; searches: typeof searches } = {
    track,
    searches,
    async findTrack(song) {
      searches.push(song);
      return catalog.track;
    },
  };
  return catalog;
}

import { normalizeName, songKey } from "@coverband/shared";
import { AppError } from "../core/errors";

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

/** A track as the search finds it: its album's genre is another request. */
export type FoundTrack = Omit<CatalogTrack, "genre"> & { albumId: number | null };

/** Tracks a link search proposes (#220). */
export const TRACK_MATCHES = 5;

/** Deezer failed (down, slow, refusing) during a link search: logged with its cause (#208). */
export class CatalogUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super("deezer_unavailable", "Deezer is not available right now");
    this.cause = cause;
  }
}

/**
 * Where a new song's details are looked up (#199): Deezer, or a fake in tests. Both throw when
 * the catalog fails (down, slow, refusing, another shape): the caller logs it and says so (#208).
 */
export type MusicCatalog = {
  /** The best match, or null when nothing matches. */
  findTrack(song: { title: string; artist: string }): Promise<FoundTrack | null>;
  /** The album's first genre, or null when it has none. */
  albumGenre(albumId: number): Promise<string | null>;
  /** Up to TRACK_MATCHES tracks for free text, in Deezer's order (a link search, #220). */
  searchTracks(text: string): Promise<FoundTrack[]>;
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
 * search by artist and title, then the album for the genre.
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

  async function search(text: string, limit: number) {
    // A plain search: Deezer's advanced syntax (artist:"…" track:"…") finds nothing.
    const { data: tracks } = (await get("search", { q: text, limit: String(limit) })) as {
      data?: DeezerTrack[];
    };
    if (!Array.isArray(tracks)) throw new Error("Deezer answered something else");
    return tracks;
  }

  return {
    async findTrack(song) {
      const tracks = await search(`${song.artist} ${song.title}`, 10);
      // The same title and artist (case, accents and punctuation aside) first, then the same
      // artist, else Deezer's first.
      const wanted = songKey(song);
      const artist = normalizeName(song.artist);
      const track =
        tracks.find((t) => songKey({ title: t.title, artist: t.artist.name }) === wanted) ??
        tracks.find((t) => normalizeName(t.artist.name) === artist) ??
        tracks[0];
      return track ? foundTrack(track) : null;
    },

    async searchTracks(text) {
      return (await search(text, TRACK_MATCHES)).map(foundTrack);
    },

    async albumGenre(albumId) {
      const album = (await get(`album/${albumId}`)) as { genres?: { data?: { name: string }[] } };
      const name = album.genres?.data?.[0]?.name;
      return typeof name === "string" && name ? name : null;
    },
  };
}

function foundTrack(track: DeezerTrack): FoundTrack {
  return {
    url: String(track.link),
    title: String(track.title),
    artist: String(track.artist.name),
    album: track.album?.title ? String(track.album.title) : null,
    duration: typeof track.duration === "number" && track.duration > 0 ? track.duration : null,
    albumId: typeof track.album?.id === "number" ? track.album.id : null,
  };
}

/**
 * Tests: answers with the given track (its genre from its album) for every search, and remembers
 * the searches (a link search's text too); `down` fails every request.
 */
export function createMemoryCatalog(track: CatalogTrack | null = null) {
  const searches: { title: string; artist: string }[] = [];
  const texts: string[] = [];
  const catalog: MusicCatalog & {
    track: CatalogTrack | null;
    searches: typeof searches;
    texts: typeof texts;
    down: boolean;
  } = {
    track,
    searches,
    texts,
    down: false,
    async findTrack(song) {
      searches.push(song);
      if (catalog.down) throw new Error("Deezer is down");
      if (!catalog.track) return null;
      const { genre: _, ...found } = catalog.track;
      return { ...found, albumId: 1 };
    },
    async albumGenre() {
      if (catalog.down) throw new Error("Deezer is down");
      return catalog.track?.genre ?? null;
    },
    async searchTracks(text) {
      texts.push(text);
      if (catalog.down) throw new Error("Deezer is down");
      if (!catalog.track) return [];
      const { genre: _, ...found } = catalog.track;
      return [{ ...found, albumId: 1 }];
    },
  };
  return catalog;
}

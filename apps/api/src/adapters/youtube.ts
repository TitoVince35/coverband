import { normalizeName } from "@coverband/shared";

/** A YouTube video found for a song (#200). */
export type Video = {
  id: string;
  title: string;
  channel: string;
  /** In seconds, when known. */
  duration: number | null;
  /** The full description: "Provided to YouTube by…" marks an album track. */
  description: string;
};

/** Where a new song's videos are searched (#200): YouTube, or a fake in tests. */
export type VideoSearch = {
  /** Videos for the song, YouTube's order; throws when YouTube refuses or doesn't answer. */
  search(song: { title: string; artist: string }): Promise<Video[]>;
  /** A video's thumbnail (its image file), or null when there is none. */
  thumbnail(videoId: string): Promise<{ body: ReadableStream; type: string } | null>;
};

/** A YouTube video id: 11 letters, digits, - and _. */
export const VIDEO_ID = /^[\w-]{11}$/;

/** How many videos the search asks for, before ranking keeps the best ones. */
const SEARCHED = 15;

/** An ISO 8601 duration as YouTube gives it ("PT1H4M7S") in seconds, or null. */
export function parseIsoDuration(text: string | undefined): number | null {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text ?? "");
  if (!match || text === "P" || text === "PT") return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/** YouTube's search snippets come HTML-escaped ("Don&#39;t Stop"). */
function unescapeHtml(text: string) {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

type SearchItem = { id?: { videoId?: string } };
type VideoItem = {
  id: string;
  snippet?: { title?: string; channelTitle?: string; description?: string };
  contentDetails?: { duration?: string };
};

/**
 * YouTube Data API v3 with the app's key (server only, never sent to the browser). A search costs
 * 100 of the 10,000 free units a day, the details of its videos 1 more: about 100 searches a day
 * for the whole app, hence a quota per band. Thumbnails come from YouTube's image servers through
 * the API, so phones never contact Google.
 */
export function createYoutubeSearch({
  apiKey,
  baseUrl = "https://www.googleapis.com/youtube/v3",
  thumbnailsUrl = "https://i.ytimg.com",
  timeoutMs = 8000,
  fetch = globalThis.fetch,
}: {
  apiKey: string;
  baseUrl?: string;
  thumbnailsUrl?: string;
  /** Per request. */
  timeoutMs?: number;
  /** Tests pass their own. */
  fetch?: (url: URL, init: RequestInit) => Promise<Response>;
}): VideoSearch {
  const under = (base: string, path: string) =>
    new URL(path, base.endsWith("/") ? base : `${base}/`);

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = under(baseUrl, path);
    for (const [name, value] of Object.entries({ ...params, key: apiKey })) {
      url.searchParams.set(name, value);
    }
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // A quota exceeded or a bad key is a 403: the caller logs it, the search shows no videos.
    if (!res.ok) throw new Error(`YouTube answered ${res.status} to ${path}`);
    return (await res.json()) as T;
  }

  return {
    async search(song) {
      const { items = [] } = await get<{ items?: SearchItem[] }>("search", {
        part: "snippet",
        type: "video",
        // Music.
        videoCategoryId: "10",
        maxResults: String(SEARCHED),
        q: `${song.artist} ${song.title}`,
      });
      const ids = items.flatMap((item) => {
        const id = item.id?.videoId;
        return id && VIDEO_ID.test(id) ? [id] : [];
      });
      if (ids.length === 0) return [];
      // The durations and full descriptions, in the search's order.
      const details = await get<{ items?: VideoItem[] }>("videos", {
        part: "snippet,contentDetails",
        id: ids.join(","),
      });
      const byId = new Map((details.items ?? []).map((item) => [item.id, item]));
      return ids.flatMap((id) => {
        const item = byId.get(id);
        if (!item) return [];
        return [
          {
            id,
            title: unescapeHtml(String(item.snippet?.title ?? "")),
            channel: unescapeHtml(String(item.snippet?.channelTitle ?? "")),
            duration: parseIsoDuration(item.contentDetails?.duration),
            description: String(item.snippet?.description ?? ""),
          },
        ];
      });
    },

    async thumbnail(videoId) {
      if (!VIDEO_ID.test(videoId)) return null;
      // The medium size (320 × 180): enough for a list on a phone.
      const res = await fetch(under(thumbnailsUrl, `vi/${videoId}/mqdefault.jpg`), {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok || !res.body) return null;
      return { body: res.body, type: res.headers.get("content-type") ?? "image/jpeg" };
    },
  };
}

/** Words of a title that mark another version than the album's, unless the song's title has them. */
const OTHER_VERSIONS = [
  "live",
  "cover",
  "karaoke",
  "lyrics",
  "lyric",
  "remix",
  "acoustic",
  "reaction",
  "instrumental",
  "tutorial",
  "lesson",
  "slowed",
  "sped up",
  "8d",
  "concert",
  "unplugged",
];

/** The comparable words of a text: lowercase, no accents, no punctuation. */
const words = (text: string) => ` ${normalizeName(text)} `;

/**
 * How likely a video is the album version of the song (higher is better): YouTube Music's
 * "Artist - Topic" channels and "Provided to YouTube by…" (album tracks, audio only) first, then
 * the artist's own channels; live versions, covers, karaoke, lyrics videos... last, unless the
 * song's title asks for them ("Creep (Acoustic)"), and then the other versions last.
 */
export function videoScore(video: Video, song: { title: string; artist: string }) {
  const title = words(video.title);
  const wanted = words(song.title);
  const artist = words(song.artist).trim();
  const channel = video.channel.toLowerCase();
  let score = 0;
  if (channel.endsWith(" - topic")) score += 3;
  if (video.description.includes("Provided to YouTube by")) score += 2;
  if (
    artist &&
    words(video.channel.replace(/ - topic$/i, "").replace(/vevo$/i, "")).includes(` ${artist} `)
  ) {
    score += 1;
  }
  if (title.includes(wanted)) score += 1;
  // Another version than the one asked: "live" when the song isn't, or the studio track when the
  // song is "Creep (Acoustic)".
  for (const marker of OTHER_VERSIONS) {
    if (title.includes(` ${marker} `) !== wanted.includes(` ${marker} `)) score -= 3;
  }
  return score;
}

/** How many videos "I feel lucky" proposes. */
export const VIDEO_PROPOSALS = 5;

/** The best videos for the song, best first (YouTube's order between equals). */
export function rankVideos(videos: readonly Video[], song: { title: string; artist: string }) {
  return videos
    .map((video, order) => ({ video, order, score: videoScore(video, song) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, VIDEO_PROPOSALS)
    .map(({ video }) => video);
}

/** Tests: answers with the given videos for every search, and remembers the searches. */
export function createMemoryVideoSearch(videos: Video[] = []) {
  const searches: { title: string; artist: string }[] = [];
  const search: VideoSearch & { videos: Video[]; searches: typeof searches; down: boolean } = {
    videos,
    searches,
    down: false,
    async search(song) {
      searches.push(song);
      if (search.down) throw new Error("YouTube is down");
      return search.videos;
    },
    async thumbnail(videoId) {
      if (!VIDEO_ID.test(videoId)) return null;
      return { body: new Blob([`thumbnail ${videoId}`]).stream(), type: "image/jpeg" };
    },
  };
  return search;
}

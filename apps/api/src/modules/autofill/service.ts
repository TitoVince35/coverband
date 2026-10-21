import type { CatalogTrack } from "../../adapters/deezer";
import { rankVideos } from "../../adapters/youtube";
import type { Logger } from "../../core/log";
import type { AppDeps } from "../../deps";

/** A video proposed for a new song (#200): its thumbnail comes through the API. */
export type VideoProposal = {
  id: string;
  url: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnailUrl: string;
};

/** The services a search asks; one that fails is said (#208): the member knows it's an error. */
export type AutofillSource = "deezer" | "youtube";

/**
 * What "Search and add" proposes for a new song: Deezer's track (#199), and YouTube's best videos
 * (#200), or null when YouTube isn't configured or fails; `failed` lists the services that failed
 * (logged, the member sees which, never their message).
 */
export type Autofill = {
  track: CatalogTrack | null;
  videos: VideoProposal[] | null;
  failed: AutofillSource[];
};

/** Looks a new song up by its title and artist. Nothing is saved: the member chooses. */
export async function autofill(
  { catalog, videos }: Pick<AppDeps, "catalog" | "videos">,
  log: Logger,
  band: { slug: string },
  song: { title: string; artist: string },
): Promise<Autofill> {
  const failed: AutofillSource[] = [];

  const findTrack = async (): Promise<CatalogTrack | null> => {
    let found: Awaited<ReturnType<typeof catalog.findTrack>>;
    try {
      found = await catalog.findTrack(song);
    } catch (error) {
      log.error("Deezer search failed", { err: error });
      failed.push("deezer");
      return null;
    }
    if (!found) return null;
    const { albumId, ...track } = found;
    let genre: string | null = null;
    if (albumId !== null) {
      try {
        genre = await catalog.albumGenre(albumId);
      } catch (error) {
        // The track is still a match, without its genre.
        log.error("Deezer album failed", { err: error, albumId });
        failed.push("deezer");
      }
    }
    return { ...track, genre };
  };

  const searchVideos = async () => {
    if (!videos) return null;
    try {
      return rankVideos(await videos.search(song), song).map((video) => ({
        id: video.id,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        title: video.title,
        channel: video.channel,
        duration: video.duration,
        thumbnailUrl: `/api/bands/${band.slug}/autofill/thumbnails/${video.id}`,
      }));
    } catch (error) {
      // A quota exceeded or a bad key: the member still gets Deezer's details.
      log.error("YouTube search failed", { err: error });
      failed.push("youtube");
      return null;
    }
  };

  const [track, proposals] = await Promise.all([findTrack(), searchVideos()]);
  return { track, videos: proposals, failed };
}

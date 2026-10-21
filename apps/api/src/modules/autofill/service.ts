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

/**
 * What "I feel lucky" proposes for a new song: Deezer's track (#199), and YouTube's best videos
 * (#200), or null when YouTube isn't configured or doesn't answer.
 */
export type Autofill = { track: CatalogTrack | null; videos: VideoProposal[] | null };

/** Looks a new song up by its title and artist. Nothing is saved: the member chooses. */
export async function autofill(
  { catalog, videos }: Pick<AppDeps, "catalog" | "videos">,
  log: Logger,
  band: { slug: string },
  song: { title: string; artist: string },
): Promise<Autofill> {
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
      log.warn("YouTube search failed", { err: error });
      return null;
    }
  };
  const [track, proposals] = await Promise.all([catalog.findTrack(song), searchVideos()]);
  return { track, videos: proposals };
}

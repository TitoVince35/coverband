import { normalizeName, type SongStatus } from "@coverband/shared";
import type { Song } from "@/lib/songs";

export type RepertoireSort = "title" | "energy";
export type SortDirection = "asc" | "desc";

/** Each sort's direction when chosen (#218): titles A to Z, the hottest songs first. */
export const DEFAULT_DIRECTION: Record<RepertoireSort, SortDirection> = {
  title: "asc",
  energy: "desc",
};

/**
 * The songs to show: matching the search (title or artist, accents and case ignored) and the
 * status, sorted by title (as the API sends them, or reversed) or by energy, unrated songs last
 * whichever the direction (#218).
 */
export function repertoireView<S extends Pick<Song, "title" | "artist" | "status" | "energy">>(
  songs: readonly S[],
  {
    query,
    status,
    sort,
    direction = DEFAULT_DIRECTION[sort],
  }: {
    query: string;
    status: SongStatus | "all";
    sort: RepertoireSort;
    direction?: SortDirection;
  },
): S[] {
  const words = normalizeName(query);
  const shown = songs.filter(
    (song) =>
      (status === "all" || song.status === status) &&
      normalizeName(`${song.title} ${song.artist}`).includes(words),
  );
  if (sort === "title") return direction === "asc" ? shown : shown.reverse();
  const sign = direction === "asc" ? 1 : -1;
  // Stable: songs of the same energy keep their title order.
  return shown.sort((a, b) =>
    a.energy === null || b.energy === null
      ? Number(a.energy === null) - Number(b.energy === null)
      : sign * (a.energy - b.energy),
  );
}

import { normalizeName, type SongStatus } from "@coverband/shared";
import type { Song } from "@/lib/songs";

export type RepertoireSort = "title" | "energy";

/**
 * The songs to show: matching the search (title or artist, accents and case ignored) and the
 * status, sorted by title (as the API sends them) or by energy, hottest first, unrated last.
 */
export function repertoireView<S extends Pick<Song, "title" | "artist" | "status" | "energy">>(
  songs: readonly S[],
  { query, status, sort }: { query: string; status: SongStatus | "all"; sort: RepertoireSort },
): S[] {
  const words = normalizeName(query);
  const shown = songs.filter(
    (song) =>
      (status === "all" || song.status === status) &&
      normalizeName(`${song.title} ${song.artist}`).includes(words),
  );
  // Stable: songs of the same energy keep their title order.
  return sort === "energy" ? shown.sort((a, b) => (b.energy ?? 0) - (a.energy ?? 0)) : shown;
}

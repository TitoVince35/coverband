import type { MusicalKey } from "@coverband/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiRequestError, ensureOk } from "@/lib/errors";

/** A band's repertoire, by title. */
export const songsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "songs"],
    queryFn: async () =>
      (
        await (
          await ensureOk(await api.bands[":bandSlug"].songs.$get({ param: { bandSlug } }))
        ).json()
      ).songs,
  });

export type Song = Awaited<ReturnType<ReturnType<typeof songsQuery>["queryFn"] & {}>>[number];

/** One song, with who added it. */
export const songQuery = (bandSlug: string, songId: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "songs", songId],
    // A song that isn't there won't appear by asking again: say so at once.
    retry: (failures, error) =>
      !(error instanceof ApiRequestError && error.code === "not_found") && failures < 3,
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].songs[":songId"].$get({ param: { bandSlug, songId } }),
          )
        ).json()
      ).song,
  });

export type SongFields = {
  title: string;
  artist: string;
  standardDuration: number | null;
  ownDuration: number | null;
  key: MusicalKey | null;
  bandKey: MusicalKey | null;
  tempo: number | null;
  style: string | null;
  notes: string | null;
};

/** Adds a song; throws `song_duplicate` for a song already in the repertoire, unless confirmed. */
export async function addSong(bandSlug: string, json: SongFields & { confirmDuplicate?: boolean }) {
  const res = await api.bands[":bandSlug"].songs.$post({ param: { bandSlug }, json });
  return (await (await ensureOk(res)).json()).song;
}

/** Changes some of a song's fields; same duplicate rule as adding. */
export async function updateSong(
  bandSlug: string,
  songId: string,
  json: Partial<SongFields> & { confirmDuplicate?: boolean },
) {
  const res = await api.bands[":bandSlug"].songs[":songId"].$patch({
    param: { bandSlug, songId },
    json,
  });
  return (await (await ensureOk(res)).json()).song;
}

/** The duration a setlist uses: the band's own, else the original. */
export const playedDuration = (song: Pick<SongFields, "standardDuration" | "ownDuration">) =>
  song.ownDuration ?? song.standardDuration;

import type { Instrument, LyricsSource, MusicalKey, SongStatus } from "@coverband/shared";
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
          await ensureOk(
            await api.bands[":bandSlug"].songs.$get({ param: { bandSlug }, query: {} }),
          )
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
  lyrics: string | null;
  lyricsSource: LyricsSource | null;
  status: SongStatus;
  energy: number | null;
};

/** Adds a song; throws `song_duplicate` for a song already in the repertoire, unless confirmed. */
export async function addSong(
  bandSlug: string,
  json: Pick<SongFields, "title" | "artist"> & { confirmDuplicate?: boolean },
) {
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

/** Free text as the API stores it: trimmed, none when blank (notes, lyrics). */
export const storedText = (text: string) => text.trim() || null;

/** The duration a setlist uses: the band's own, else the original. */
export const playedDuration = (song: Pick<SongFields, "standardDuration" | "ownDuration">) =>
  song.ownDuration ?? song.standardDuration;

/** The band's archived songs, by title. */
export const archivedSongsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "songs", "archived"],
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].songs.$get({
              param: { bandSlug },
              query: { archived: "true" },
            }),
          )
        ).json()
      ).songs,
  });

/** Archives a song (any member), or restores it. */
export async function setSongArchived(bandSlug: string, songId: string, archived: boolean) {
  const param = { bandSlug, songId };
  const route = api.bands[":bandSlug"].songs[":songId"];
  const res = archived
    ? await route.archive.$post({ param })
    : await route.restore.$post({ param });
  return (await (await ensureOk(res)).json()).song;
}

/** Deletes a song for good (band leaders); throws `song_in_use` when something uses it. */
export async function deleteSong(bandSlug: string, songId: string) {
  await ensureOk(
    await api.bands[":bandSlug"].songs[":songId"].$delete({ param: { bandSlug, songId } }),
  );
}

export type MediaFields = { url: string; title: string | null; instruments: Instrument[] };

/** Adds a link to a song. */
export async function addMedia(bandSlug: string, songId: string, json: MediaFields) {
  const route = api.bands[":bandSlug"].songs[":songId"].media;
  return (await (await ensureOk(await route.$post({ param: { bandSlug, songId }, json }))).json())
    .media;
}

/** Changes a song's link. */
export async function updateMedia(
  bandSlug: string,
  songId: string,
  mediaId: string,
  json: Partial<MediaFields>,
) {
  const route = api.bands[":bandSlug"].songs[":songId"].media[":mediaId"];
  const res = await route.$patch({ param: { bandSlug, songId, mediaId }, json });
  return (await (await ensureOk(res)).json()).media;
}

/** Removes a song's link. */
export async function deleteMedia(bandSlug: string, songId: string, mediaId: string) {
  const route = api.bands[":bandSlug"].songs[":songId"].media[":mediaId"];
  await ensureOk(await route.$delete({ param: { bandSlug, songId, mediaId } }));
}

/**
 * Lyrics found online for a song (#130), to choose from, and whether LRCLIB only knows it as an
 * instrumental (#136). Each search calls LRCLIB (rate-limited):
 * not retried, kept while the cache lasts, searched again once the song changes (its title).
 */
export const lyricsSearchQuery = (bandSlug: string, songId: string, text?: string) =>
  queryOptions({
    // A free search (#138) is its own search; none: the song's title and artist.
    queryKey: ["bands", bandSlug, "songs", songId, "lyrics-search", text ?? null],
    retry: false,
    queryFn: async () =>
      await (
        await ensureOk(
          await api.bands[":bandSlug"].songs[":songId"].lyrics.search.$get({
            param: { bandSlug, songId },
            query: text ? { q: text } : {},
          }),
        )
      ).json(),
  });

export type LyricsMatch = Awaited<
  ReturnType<ReturnType<typeof lyricsSearchQuery>["queryFn"] & {}>
>["matches"][number];

import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

/** "Search and add" (#201): a new song looked up online, Deezer's track and YouTube's videos. */
export async function searchAutofill(bandSlug: string, song: { title: string; artist: string }) {
  const res = await api.bands[":bandSlug"].autofill.$get({ param: { bandSlug }, query: song });
  return (await ensureOk(res)).json();
}

/**
 * Deezer's tracks for free text (#220), to add one as a song's link. Rate-limited per member: not
 * retried, kept while the cache lasts, never saved offline.
 */
export const trackSearchQuery = (bandSlug: string, text: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "autofill", "tracks", text],
    retry: false,
    queryFn: async () =>
      (
        await (
          await ensureOk(
            await api.bands[":bandSlug"].autofill.tracks.$get({
              param: { bandSlug },
              query: { q: text },
            }),
          )
        ).json()
      ).tracks,
  });

export type TrackMatch = Awaited<
  ReturnType<ReturnType<typeof trackSearchQuery>["queryFn"] & {}>
>[number];

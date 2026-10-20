import { type QueryClient, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { bandJournalQuery, bandQuery, membersQuery, myBandsQuery } from "@/lib/bands";
import { ensureOk } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { songQuery, songsQuery } from "@/lib/songs";

/**
 * The whole repertoire as each song's page shows it, lyrics and links included, so songs never
 * opened are there offline too: it fills every song's query and only keeps how many there were.
 * A query, so it follows the cache: fetched again once stale, and gone with the user's data when
 * someone logs out or in (#174).
 */
export const songDetailsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "songs", "details"],
    queryFn: async ({ client }) => {
      const res = await api.bands[":bandSlug"].songs.details.$get({ param: { bandSlug } });
      const { songs } = await (await ensureOk(res)).json();
      for (const song of songs) {
        client.setQueryData(songQuery(bandSlug, song.id).queryKey, song);
      }
      return songs.length;
    },
  });

/**
 * Loads what a band needs offline (#165): its page, journal, lineup, repertoire and every song,
 * each only if no longer fresh: every load wakes the database.
 */
export async function keepBandOffline(queryClient: QueryClient, bandSlug: string) {
  await Promise.all([
    queryClient.prefetchQuery(bandQuery(bandSlug)),
    queryClient.prefetchQuery(bandJournalQuery(bandSlug)),
    queryClient.prefetchQuery(membersQuery(bandSlug)),
    queryClient.prefetchQuery(songsQuery(bandSlug)),
    queryClient.prefetchQuery(songDetailsQuery(bandSlug)),
  ]);
}

/**
 * Keeps every band of the user ready for offline use while online. In the logged-in layout, so it
 * runs after login whichever page the user lands on (#174).
 */
export function useKeepBandsOffline() {
  const queryClient = useQueryClient();
  const online = useOnline();
  const bands = useQuery(myBandsQuery);
  const key = bands.data?.map((band) => band.slug).join("\n") ?? "";
  // Again each time the bands are fetched again (stale, back to the foreground): what is still
  // fresh isn't loaded twice.
  const fetchedAt = bands.dataUpdatedAt;
  useEffect(() => {
    if (!online || !key || !fetchedAt) return;
    for (const bandSlug of key.split("\n")) {
      // Best effort (prefetchQuery never throws): a failure only means less is available offline.
      void keepBandOffline(queryClient, bandSlug);
    }
  }, [online, key, fetchedAt, queryClient]);
}

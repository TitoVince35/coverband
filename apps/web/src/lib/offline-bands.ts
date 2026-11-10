import { type QueryClient, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { bandJournalQuery, bandQuery, membersQuery, myBandsQuery } from "@/lib/bands";
import { ensureOk } from "@/lib/errors";
import { keepDocumentsOffline } from "@/lib/offline-documents";
import { keepLogoOffline } from "@/lib/offline-logos";
import { useOnline } from "@/lib/online";
import { archivedSetlistsQuery, setlistQuery, setlistsQuery } from "@/lib/setlists";
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
      // Their photos and PDFs too (#240), each downloaded once.
      void keepDocumentsOffline(
        bandSlug,
        songs.flatMap((song) => song.documents),
      );
      return songs.length;
    },
  });

/**
 * Every setlist of the band, archived ones too, with its parts and songs (#274), so setlists never
 * opened are there offline: it fills each setlist's query and only keeps how many there were.
 * A query, like the repertoire's details.
 */
export const setlistDetailsQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug, "setlists", "details"],
    queryFn: async ({ client }) => {
      const res = await api.bands[":bandSlug"].setlists.details.$get({ param: { bandSlug } });
      const { setlists } = await (await ensureOk(res)).json();
      for (const setlist of setlists) {
        const key = setlistQuery(bandSlug, setlist.id).queryKey;
        // Never older than what's there (an editor that just saved).
        if ((client.getQueryData(key)?.version ?? 0) <= setlist.version) {
          client.setQueryData(key, setlist);
        }
      }
      return setlists.length;
    },
  });

/**
 * Loads what a band needs offline (#165): its page, journal, lineup, repertoire and every song,
 * its setlists with their songs (#274), each only if no longer fresh: every load wakes the database. And its logo (#178), downloaded
 * only when it changed.
 */
export async function keepBandOffline(queryClient: QueryClient, bandSlug: string) {
  const keepLogo = async () => {
    await queryClient.prefetchQuery(bandQuery(bandSlug));
    // Unknown (the band failed to load): leave the saved logo as it is.
    const band = queryClient.getQueryData(bandQuery(bandSlug).queryKey)?.band;
    if (band) await keepLogoOffline(bandSlug, band.logo);
  };
  await Promise.all([
    keepLogo(),
    queryClient.prefetchQuery(bandJournalQuery(bandSlug)),
    queryClient.prefetchQuery(membersQuery(bandSlug)),
    queryClient.prefetchQuery(songsQuery(bandSlug)),
    queryClient.prefetchQuery(songDetailsQuery(bandSlug)),
    queryClient.prefetchQuery(setlistsQuery(bandSlug)),
    queryClient.prefetchQuery(archivedSetlistsQuery(bandSlug)),
    queryClient.prefetchQuery(setlistDetailsQuery(bandSlug)),
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
  // A suspended band (#248) has nothing to keep: its pages only say it's suspended.
  const key =
    bands.data
      ?.filter((band) => !band.suspended)
      .map((band) => band.slug)
      .join("\n") ?? "";
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

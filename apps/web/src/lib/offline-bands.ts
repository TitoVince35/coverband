import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { bandJournalQuery, bandQuery, membersQuery } from "@/lib/bands";
import { ensureOk } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { STALE_TIME } from "@/lib/query-client";
import { songQuery, songsQuery } from "@/lib/songs";

/** When each band's whole repertoire was last loaded, in this app session. */
const loadedAt = new Map<string, number>();

/**
 * Loads what a band needs offline (#165): its page, journal, lineup and repertoire (each only if
 * no longer fresh), and the whole repertoire as each song's page shows it, lyrics and links
 * included, so songs never opened are there too. At most once per fresh window per band: every
 * load wakes the database.
 */
export async function keepBandOffline(
  queryClient: QueryClient,
  bandSlug: string,
  now = Date.now(),
) {
  await Promise.all([
    queryClient.prefetchQuery(bandQuery(bandSlug)),
    queryClient.prefetchQuery(bandJournalQuery(bandSlug)),
    queryClient.prefetchQuery(membersQuery(bandSlug)),
    queryClient.prefetchQuery(songsQuery(bandSlug)),
  ]);
  if (now - (loadedAt.get(bandSlug) ?? 0) < STALE_TIME) return;
  loadedAt.set(bandSlug, now);
  const res = await api.bands[":bandSlug"].songs.details.$get({ param: { bandSlug } });
  const { songs } = await (await ensureOk(res)).json();
  for (const song of songs) {
    queryClient.setQueryData(songQuery(bandSlug, song.id).queryKey, song, { updatedAt: now });
  }
}

/** Keeps these bands ready for offline use while online (home page, a band's pages). */
export function useKeepBandsOffline(bandSlugs: readonly string[]) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const key = bandSlugs.join("\n");
  useEffect(() => {
    if (!online || !key) return;
    for (const bandSlug of key.split("\n")) {
      // Best effort: a failure only means less is available offline.
      keepBandOffline(queryClient, bandSlug).catch(() => loadedAt.delete(bandSlug));
    }
  }, [online, key, queryClient]);
}

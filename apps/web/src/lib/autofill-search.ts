import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

/** "Search and add" (#201): a new song looked up online, Deezer's track and YouTube's videos. */
export async function searchAutofill(bandSlug: string, song: { title: string; artist: string }) {
  const res = await api.bands[":bandSlug"].autofill.$get({ param: { bandSlug }, query: song });
  return (await ensureOk(res)).json();
}

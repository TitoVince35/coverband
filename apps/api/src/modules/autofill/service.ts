import type { CatalogTrack } from "../../adapters/deezer";
import type { AppDeps } from "../../deps";

/** What "I feel lucky" proposes for a new song (#199): Deezer's track; YouTube's videos (#200). */
export type Autofill = { track: CatalogTrack | null };

/** Looks a new song up by its title and artist. Nothing is saved: the member chooses. */
export async function autofill(
  { catalog }: Pick<AppDeps, "catalog">,
  song: { title: string; artist: string },
): Promise<Autofill> {
  return { track: await catalog.findTrack(song) };
}

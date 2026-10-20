// Band logos kept on the device for offline use (#178). Not in the query cache (files, not
// data) and never through the service worker (private band data): in the app's offline database,
// one entry per band, emptied with the rest of the user's data.

import type { BandLogo } from "@coverband/shared";
import { LOGO_STORE, OFFLINE_MAX_AGE_MS, runOffline } from "@/lib/offline-cache";

/** A band's saved logo: the full one (the band list shows it scaled down), and its URL. */
type SavedLogo = { url: string; blob: Blob; savedAt: number };

const available = () => typeof indexedDB !== "undefined";

/** Whether the saved copy is this logo and still recent enough to keep. */
export function isUpToDate(saved: SavedLogo | undefined, url: string, now: number) {
  return saved?.url === url && now - saved.savedAt < OFFLINE_MAX_AGE_MS;
}

async function read(bandSlug: string) {
  return runOffline<SavedLogo | undefined>(LOGO_STORE, "readonly", (store) => store.get(bandSlug));
}

/**
 * Keeps the band's current logo on the device: downloaded only when it changed (its URL is
 * versioned), deleted once the band has none. Best effort: a failure only means no offline logo.
 */
export async function keepLogoOffline(bandSlug: string, logo: BandLogo | null, now = Date.now()) {
  if (!available()) return;
  try {
    if (!logo) {
      await runOffline(LOGO_STORE, "readwrite", (store) => store.delete(bandSlug));
      return;
    }
    if (isUpToDate(await read(bandSlug), logo.url, now)) return;
    const res = await fetch(logo.url);
    if (!res.ok) return;
    const saved: SavedLogo = { url: logo.url, blob: await res.blob(), savedAt: now };
    await runOffline(LOGO_STORE, "readwrite", (store) => store.put(saved, bandSlug));
  } catch {
    // No offline logo this time; the initials show instead.
  }
}

/** The saved logo of this band, if it is this one and not too old; null otherwise. */
export async function savedLogo(bandSlug: string, url: string, now = Date.now()) {
  if (!available()) return null;
  const saved = await read(bandSlug).catch(() => undefined);
  return saved && isUpToDate(saved, url, now) ? saved.blob : null;
}

/** Forgets every saved logo (logout, another account logging in). */
export async function clearSavedLogos() {
  if (!available()) return;
  await runOffline(LOGO_STORE, "readwrite", (store) => store.clear()).catch(() => {});
}

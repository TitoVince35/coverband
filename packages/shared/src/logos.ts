/** Largest side of a band logo, in pixels: enough to print it (the browser fits it, never crops). */
export const LOGO_SIZE = 2000;

/** Largest side of a logo's thumbnail (the band list), in pixels. */
export const LOGO_THUMBNAIL_SIZE = 256;

/** Largest accepted files, in bytes: the browser re-encodes smaller until they fit. */
export const LOGO_MAX_BYTES = 3_000_000;
export const LOGO_THUMBNAIL_MAX_BYTES = 200_000;

/** A band's logo as the API returns it: versioned URLs, cached for good. */
export type BandLogo = { url: string; thumbnailUrl: string };

/** The version in a storage key: the file name without its extension. */
const versionOf = (key: string) => key.split("/").pop()?.split(".")[0] ?? "";

/** A band's logo from its storage keys, or null without one. */
export function bandLogo(
  bandSlug: string,
  keys: { logo: string | null; thumbnail: string | null },
): BandLogo | null {
  if (!keys.logo || !keys.thumbnail) return null;
  const base = `/api/bands/${bandSlug}/logo`;
  return {
    url: `${base}?v=${versionOf(keys.logo)}`,
    thumbnailUrl: `${base}/thumbnail?v=${versionOf(keys.thumbnail)}`,
  };
}

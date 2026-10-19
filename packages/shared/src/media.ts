/** Where a song's link points, detected from its URL; any other URL is a plain link. */
export const MEDIA_PROVIDERS = [
  "youtube",
  "spotify",
  "deezer",
  "apple_music",
  "soundcloud",
] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

/** Brand names, the same in every language. */
export const MEDIA_PROVIDER_NAMES: Record<MediaProvider, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  deezer: "Deezer",
  apple_music: "Apple Music",
  soundcloud: "SoundCloud",
};

/** Limits shared by the API and the forms. */
export const MEDIA_LIMITS = { url: 2000, title: 100, perSong: 20 } as const;

/** Each provider's domains; their subdomains count too (m.youtube.com, open.spotify.com). */
const DOMAINS: [string, MediaProvider][] = [
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["youtube-nocookie.com", "youtube"],
  ["spotify.com", "spotify"],
  ["spotify.link", "spotify"],
  ["deezer.com", "deezer"],
  ["deezer.page.link", "deezer"],
  ["music.apple.com", "apple_music"],
  ["soundcloud.com", "soundcloud"],
  ["snd.sc", "soundcloud"],
];

/** A typed link as a URL, if it is one we accept: http or https only, within the length limit. */
export function parseMediaUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (trimmed.length > MEDIA_LIMITS.url) return null;
  try {
    // Not URL.canParse: older phones (iOS 16) don't have it.
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** The provider a link points to, or null for any other site. */
export function mediaProvider(text: string): MediaProvider | null {
  const host = parseMediaUrl(text)?.hostname.toLowerCase();
  if (!host) return null;
  return DOMAINS.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] ?? null;
}

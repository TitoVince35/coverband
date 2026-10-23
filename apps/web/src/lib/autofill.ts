import { MAX_SONG_DURATION, MEDIA_LIMITS, SONG_MAX_LENGTH } from "@coverband/shared";
import type { searchAutofill } from "@/lib/autofill-search";
import type { MediaFields } from "@/lib/songs";

export type Autofill = Awaited<ReturnType<typeof searchAutofill>>;
export type AutofillVideo = NonNullable<Autofill["videos"]>[number];

/**
 * What adding the song saves from the search: Deezer's duration (else the chosen video's) as the
 * original duration, Deezer's genre as the style, and the chosen video as its first link, named
 * by its title (#208, shortened to fit). No Deezer link: it was noise (#219). Values over the
 * song's limits are left out.
 */
export function autofillChoices(result: Autofill, videoId: string | null) {
  const video = result.videos?.find((v) => v.id === videoId) ?? null;
  const duration = result.track?.duration ?? video?.duration ?? null;
  const genre = result.track?.genre ?? null;
  const link = (url: string, title: string | null = null): MediaFields => ({
    url,
    title: title && fitTitle(title),
    instruments: [],
  });
  return {
    standardDuration: duration !== null && duration <= MAX_SONG_DURATION ? duration : null,
    style: genre && genre.length <= SONG_MAX_LENGTH.style ? genre : null,
    links: video ? [link(video.url, video.title)] : [],
  };
}

/** A link's title within its limit: cut with "…" when longer; null when empty. */
export function fitTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return trimmed.length <= MEDIA_LIMITS.title
    ? trimmed
    : `${trimmed.slice(0, MEDIA_LIMITS.title - 1).trimEnd()}…`;
}

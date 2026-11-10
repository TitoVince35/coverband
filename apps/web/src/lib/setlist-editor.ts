import { normalizeName, SETLIST_LIMITS, type SongStatus } from "@coverband/shared";

// The setlist editor's changes (#272), as pure functions on a draft: each returns a new draft,
// which the editor shows at once and saves whole (`toContent`).

/** A song as a setlist shows it. */
export type DraftSong = {
  id: string;
  title: string;
  artist: string;
  standardDuration: number | null;
  ownDuration: number | null;
  status: SongStatus;
  energy: number | null;
  archivedAt: string | null;
};

/** A song's place in a part: `key` tells two places of the same song apart (drag and drop). */
export type DraftEntry = { key: string; song: DraftSong };

export type DraftPart = { key: string; name: string | null; songs: DraftEntry[] };

export type Draft = DraftPart[];

const newKey = () => crypto.randomUUID();

/** A draft of a setlist's content, as the API sends it. */
export const toDraft = (
  parts: readonly { name: string | null; songs: readonly DraftSong[] }[],
): Draft =>
  parts.map((part) => ({
    key: newKey(),
    name: part.name,
    songs: part.songs.map((song) => ({ key: newKey(), song })),
  }));

/** The content the API saves: each part's name and its songs' ids. */
export const toContent = (draft: Draft) =>
  draft.map((part) => ({ name: part.name, songs: part.songs.map((entry) => entry.song.id) }));

/** How many songs the setlist has, whatever their part. */
export const songCount = (draft: Draft) =>
  draft.reduce((total, part) => total + part.songs.length, 0);

/** Where an entry is: its part's index and its own. */
export function findEntry(draft: Draft, key: string) {
  for (const [part, { songs }] of draft.entries()) {
    const index = songs.findIndex((entry) => entry.key === key);
    if (index >= 0) return { part, index };
  }
  return null;
}

const withPart = (draft: Draft, index: number, songs: DraftEntry[]) =>
  draft.map((part, i) => (i === index ? { ...part, songs } : part));

/**
 * Moves a song one place up or down. At the top or the bottom of its part, it goes to the end of
 * the part before or the start of the part after; at either end of the setlist, nothing changes.
 */
export function moveStep(draft: Draft, key: string, step: -1 | 1): Draft {
  const at = findEntry(draft, key);
  if (!at) return draft;
  const songs = [...(draft[at.part]?.songs ?? [])];
  const target = at.index + step;
  if (target >= 0 && target < songs.length) {
    const [entry] = songs.splice(at.index, 1);
    if (entry) songs.splice(target, 0, entry);
    return withPart(draft, at.part, songs);
  }
  const nextPart = at.part + step;
  if (nextPart < 0 || nextPart >= draft.length) return draft;
  return moveTo(draft, key, nextPart, step === 1 ? 0 : (draft[nextPart]?.songs.length ?? 0));
}

/** Moves a song to a part, at an index there (by default, its end). */
export function moveTo(draft: Draft, key: string, part: number, index?: number): Draft {
  const at = findEntry(draft, key);
  const entry = at ? draft[at.part]?.songs[at.index] : undefined;
  if (!at || !entry) return draft;
  const without = withPart(
    draft,
    at.part,
    (draft[at.part]?.songs ?? []).filter((e) => e.key !== key),
  );
  const songs = [...(without[part]?.songs ?? [])];
  songs.splice(index ?? songs.length, 0, entry);
  return withPart(without, part, songs);
}

/** Takes a song out of the setlist (that place only, if it's there twice). */
export const removeSong = (draft: Draft, key: string): Draft =>
  draft.map((part) => ({ ...part, songs: part.songs.filter((entry) => entry.key !== key) }));

/** Adds songs at the end of a part, up to the setlist's limit. */
export function addSongs(draft: Draft, part: number, songs: readonly DraftSong[]): Draft {
  const room = SETLIST_LIMITS.songs - songCount(draft);
  const added = songs.slice(0, Math.max(room, 0)).map((song) => ({ key: newKey(), song }));
  return withPart(draft, part, [...(draft[part]?.songs ?? []), ...added]);
}

/** Adds an empty, unnamed part at the end, up to the limit. */
export const addPart = (draft: Draft): Draft =>
  draft.length >= SETLIST_LIMITS.parts
    ? draft
    : [...draft, { key: newKey(), name: null, songs: [] }];

/** Names a part; blank is none. */
export const renamePart = (draft: Draft, index: number, name: string): Draft =>
  draft.map((part, i) => (i === index ? { ...part, name: name.trim() || null } : part));

/** Moves a part one place up or down. */
export function movePart(draft: Draft, index: number, step: -1 | 1): Draft {
  const target = index + step;
  if (target < 0 || target >= draft.length) return draft;
  const parts = [...draft];
  const [part] = parts.splice(index, 1);
  if (part) parts.splice(target, 0, part);
  return parts;
}

/** Removes a part with its songs; the last one stays. */
export const removePart = (draft: Draft, index: number): Draft =>
  draft.length <= 1 ? draft : draft.filter((_, i) => i !== index);

/**
 * For each place of a song that's in the setlist more than once, the parts where it also is
 * (their index; its own part too when it's there twice), for the "also in" warning.
 */
export function otherPlaces(draft: Draft): Map<string, number[]> {
  const places = new Map<string, { key: string; part: number }[]>();
  for (const [part, { songs }] of draft.entries()) {
    for (const entry of songs) {
      places.set(entry.song.id, [...(places.get(entry.song.id) ?? []), { key: entry.key, part }]);
    }
  }
  const others = new Map<string, number[]>();
  for (const list of places.values()) {
    if (list.length < 2) continue;
    for (const place of list) {
      const parts = list.filter((other) => other.key !== place.key).map((other) => other.part);
      others.set(place.key, [...new Set(parts)]);
    }
  }
  return others;
}

/**
 * The songs to choose from when adding (#272): "ready" ones, and "learning" ones too when asked,
 * matching the search on the title or the artist (accents and case ignored).
 */
export function songChoices<S extends Pick<DraftSong, "title" | "artist" | "status">>(
  songs: readonly S[],
  { query, learning }: { query: string; learning: boolean },
): S[] {
  const words = normalizeName(query).split(" ").filter(Boolean);
  return songs.filter(
    (song) =>
      (song.status === "ready" || (learning && song.status === "learning")) &&
      words.every((word) => normalizeName(`${song.title} ${song.artist}`).includes(word)),
  );
}

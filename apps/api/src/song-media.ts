import { type Instrument, MEDIA_LIMITS } from "@coverband/shared";
import { and, asc, count, eq } from "drizzle-orm";
import { recordActivity } from "./activity";
import type { Db, Tx } from "./db/client";
import { songMedia, songs } from "./db/schema";
import { cleanInstruments } from "./instruments";

export type MediaFields = { url: string; title: string | null; instruments: readonly unknown[] };
export type MediaChanges = { [F in keyof MediaFields]?: MediaFields[F] | undefined };

type Member = { bandId: string; userId: string };

const columns = {
  id: songMedia.id,
  url: songMedia.url,
  title: songMedia.title,
  instruments: songMedia.instruments,
};

/** A song has as many links as it may. */
export class TooManyMediaError extends Error {
  constructor() {
    super(`A song has at most ${MEDIA_LIMITS.perSong} links`);
  }
}

/** A song's links, oldest first. */
export function mediaOf(db: Db, bandId: string, songId: string) {
  return db
    .select(columns)
    .from(songMedia)
    .where(and(eq(songMedia.bandId, bandId), eq(songMedia.songId, songId)))
    .orderBy(asc(songMedia.createdAt), asc(songMedia.id));
}

/** Locks the band's song (null when there's none): link changes to one song wait for each other. */
async function lockSong(tx: Tx, member: Member, songId: string) {
  const [song] = await tx
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.bandId, member.bandId), eq(songs.id, songId)))
    .for("update");
  return song ?? null;
}

/** A change to a song's links is a song update in the journal. */
const recordChange = (tx: Tx, member: Member, songId: string) =>
  recordActivity(tx, {
    action: "song.updated",
    bandId: member.bandId,
    actorId: member.userId,
    target: { type: "song", id: songId },
    data: { fields: "media" },
  });

/** A member adds a link to a song. Null when the band has no such song. */
export function addMedia(db: Db, member: Member, songId: string, fields: MediaFields) {
  return db.transaction(async (tx) => {
    if (!(await lockSong(tx, member, songId))) return null;
    const [row] = await tx
      .select({ n: count() })
      .from(songMedia)
      .where(eq(songMedia.songId, songId));
    if ((row?.n ?? 0) >= MEDIA_LIMITS.perSong) throw new TooManyMediaError();
    const [media] = await tx
      .insert(songMedia)
      .values({
        bandId: member.bandId,
        songId,
        url: fields.url,
        title: fields.title,
        instruments: cleanInstruments(fields.instruments),
      })
      .returning(columns);
    await recordChange(tx, member, songId);
    return media ?? null;
  });
}

/** A member changes a link. Null when the band's song has no such link. */
export function updateMedia(
  db: Db,
  member: Member,
  songId: string,
  mediaId: string,
  changes: MediaChanges,
) {
  return db.transaction(async (tx) => {
    if (!(await lockSong(tx, member, songId))) return null;
    const set: { url?: string; title?: string | null; instruments?: Instrument[] } = {};
    if (changes.url !== undefined) set.url = changes.url;
    if (changes.title !== undefined) set.title = changes.title;
    if (changes.instruments !== undefined) set.instruments = cleanInstruments(changes.instruments);
    const where = and(eq(songMedia.songId, songId), eq(songMedia.id, mediaId));
    const [media] =
      Object.keys(set).length > 0
        ? await tx.update(songMedia).set(set).where(where).returning(columns)
        : await tx.select(columns).from(songMedia).where(where);
    if (!media) return null;
    if (Object.keys(set).length > 0) await recordChange(tx, member, songId);
    return media;
  });
}

/** A member removes a link. False when the band's song has no such link. */
export function deleteMedia(db: Db, member: Member, songId: string, mediaId: string) {
  return db.transaction(async (tx) => {
    if (!(await lockSong(tx, member, songId))) return false;
    const deleted = await tx
      .delete(songMedia)
      .where(and(eq(songMedia.songId, songId), eq(songMedia.id, mediaId)))
      .returning({ id: songMedia.id });
    if (deleted.length === 0) return false;
    await recordChange(tx, member, songId);
    return true;
  });
}

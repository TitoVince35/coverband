import { findDuplicateSong, type MusicalKey, type SongStatus, songKey } from "@coverband/shared";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { recordActivity } from "./activity";
import type { Db } from "./db/client";
import { songs, users } from "./db/schema";

export type SongFields = {
  title: string;
  artist: string;
  standardDuration: number | null;
  ownDuration: number | null;
  key: MusicalKey | null;
  bandKey: MusicalKey | null;
  tempo: number | null;
  style: string | null;
  notes: string | null;
  status: SongStatus;
  energy: number | null;
};

/** Some of a song's fields; a field left undefined doesn't change. */
export type SongChanges = { [F in keyof SongFields]?: SongFields[F] | undefined };

/** A new song: title and artist, the rest optional. */
export type NewSong = SongChanges & Pick<SongFields, "title" | "artist">;

/** A song with the same title and artist is already in the repertoire (only a warning). */
export class DuplicateSongError extends Error {
  constructor(readonly song: { id: string; title: string; artist: string }) {
    super("A song with this title and artist is already in the repertoire");
  }
}

const columns = {
  id: songs.id,
  title: songs.title,
  artist: songs.artist,
  standardDuration: songs.standardDuration,
  ownDuration: songs.ownDuration,
  key: songs.key,
  bandKey: songs.bandKey,
  tempo: songs.tempo,
  style: songs.style,
  notes: songs.notes,
  status: songs.status,
  energy: songs.energy,
  archivedAt: songs.archivedAt,
  createdAt: songs.createdAt,
  updatedAt: songs.updatedAt,
};

/** A band's repertoire by title: its current songs, or its archived ones. */
export function listSongs(db: Db, bandId: string, { archived = false } = {}) {
  return db
    .select(columns)
    .from(songs)
    .where(
      and(
        eq(songs.bandId, bandId),
        archived ? isNotNull(songs.archivedAt) : isNull(songs.archivedAt),
      ),
    )
    .orderBy(asc(sql`lower(${songs.title})`), asc(sql`lower(${songs.artist})`));
}

/** One song of a band, with who added it (their current display name; null once deleted). */
export async function getSong(db: Db, bandId: string, id: string) {
  const [song] = await db
    .select({ ...columns, addedBy: users.name })
    .from(songs)
    .leftJoin(users, eq(users.id, songs.createdById))
    .where(and(eq(songs.bandId, bandId), eq(songs.id, id)));
  return song ?? null;
}

type Member = { bandId: string; userId: string };

/** Throws DuplicateSongError when the band has the same song, unless the member confirmed it. */
async function checkDuplicate(
  db: Pick<Db, "select">,
  member: Member,
  song: { title: string; artist: string },
  options: { confirmDuplicate?: boolean | undefined; exceptId?: string },
) {
  if (options.confirmDuplicate) return;
  // The repertoire only: an archived song can be added again (and restored even if it was).
  const others = await db
    .select({ id: songs.id, title: songs.title, artist: songs.artist })
    .from(songs)
    .where(and(eq(songs.bandId, member.bandId), isNull(songs.archivedAt)));
  const match = findDuplicateSong(others, song, options.exceptId);
  if (match) throw new DuplicateSongError(match);
}

/** A member adds a song to their band's repertoire. */
export function addSong(
  db: Db,
  member: Member,
  fields: NewSong,
  options: { confirmDuplicate?: boolean | undefined } = {},
) {
  return db.transaction(async (tx) => {
    await checkDuplicate(tx, member, fields, options);
    const [song] = await tx
      .insert(songs)
      .values({ ...fields, bandId: member.bandId, createdById: member.userId })
      .returning(columns);
    if (!song) throw new Error("Song not inserted");
    await recordActivity(tx, {
      action: "song.added",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "song", id: song.id },
    });
    return song;
  });
}

/**
 * A member changes some of a song's fields. Returns the song, or null when the band has no such
 * song. A change records `song.updated` with the names of the fields that changed.
 */
export function updateSong(
  db: Db,
  member: Member,
  id: string,
  changes: SongChanges,
  options: { confirmDuplicate?: boolean | undefined } = {},
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select(columns)
      .from(songs)
      .where(and(eq(songs.bandId, member.bandId), eq(songs.id, id)))
      .for("update");
    if (!current) return null;
    const changed = (Object.keys(changes) as (keyof SongFields)[]).filter(
      (field) => changes[field] !== undefined && changes[field] !== current[field],
    );
    if (changed.length === 0) return current;
    // Only a different song is checked: fixing a typo's case, or a duration, keeps an accepted
    // duplicate accepted.
    const next = {
      title: changes.title ?? current.title,
      artist: changes.artist ?? current.artist,
    };
    if (songKey(next) !== songKey(current)) {
      await checkDuplicate(tx, member, next, { ...options, exceptId: id });
    }
    const [song] = await tx
      .update(songs)
      .set(Object.fromEntries(changed.map((field) => [field, changes[field]])))
      .where(eq(songs.id, id))
      .returning(columns);
    // A new status is its own event ("Lea marked Creep as ready"); the other fields are listed.
    const event = {
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "song", id },
    } as const;
    if (changes.status !== undefined && changed.includes("status")) {
      await recordActivity(tx, {
        ...event,
        action: "song.status_changed",
        data: { status: changes.status },
      });
    }
    const others = changed.filter((field) => field !== "status");
    if (others.length > 0) {
      await recordActivity(tx, {
        ...event,
        action: "song.updated",
        data: { fields: others.join(",") },
      });
    }
    return song ?? null;
  });
}

/**
 * A member archives a song (out of the repertoire, kept everywhere else) or restores it. Returns
 * the song, or null when the band has no such song. Archiving an archived song changes nothing.
 */
export function setArchived(db: Db, member: Member, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ archivedAt: songs.archivedAt })
      .from(songs)
      .where(and(eq(songs.bandId, member.bandId), eq(songs.id, id)))
      .for("update");
    if (!current) return null;
    if ((current.archivedAt !== null) !== archived) {
      await tx
        .update(songs)
        .set({ archivedAt: archived ? new Date() : null })
        .where(eq(songs.id, id));
      await recordActivity(tx, {
        action: archived ? "song.archived" : "song.restored",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "song", id },
      });
    }
    const [song] = await tx.select(columns).from(songs).where(eq(songs.id, id));
    return song ?? null;
  });
}

/** Something uses the song (a setlist): it can only be archived. */
export class SongInUseError extends Error {
  constructor() {
    super("This song is used: archive it instead");
  }
}

/**
 * Deletes a song for good (band leaders). Whatever uses a song (setlists) references it with a
 * foreign key that refuses the deletion: that refusal becomes SongInUseError. Returns false when
 * the band has no such song.
 */
export async function deleteSong(db: Db, member: Member, id: string) {
  try {
    return await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(songs)
        .where(and(eq(songs.bandId, member.bandId), eq(songs.id, id)))
        .returning({ id: songs.id });
      if (deleted.length === 0) return false;
      await recordActivity(tx, {
        action: "song.deleted",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "song", id },
      });
      return true;
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause;
    if (cause?.code === "23503") throw new SongInUseError(); // foreign_key_violation
    throw error;
  }
}

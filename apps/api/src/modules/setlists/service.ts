import { SETLIST_LIMITS, SETLIST_MAX_LENGTH, setlistDuration } from "@coverband/shared";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { isUniqueViolation } from "../../core/db/pg-errors";
import { activity, setlistParts, setlistSongs, setlists, users } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { type SetlistSong, setlistSongsOf } from "../songs/service";

/** The band already has a setlist with this title, whatever its case. */
export class SetlistTitleTakenError extends AppError {
  constructor() {
    super("setlist_title_taken", "The band already has a setlist with this title");
  }
}

/** The band has SETLIST_LIMITS.perBand current setlists. */
export class TooManySetlistsError extends AppError {
  constructor() {
    super("too_many_setlists", `A band has at most ${SETLIST_LIMITS.perBand} setlists`);
  }
}

/** An archived setlist is read-only: restore it first. */
export class SetlistArchivedError extends AppError {
  constructor() {
    super("setlist_archived", "This setlist is archived: restore it to change it");
  }
}

/** Someone saved the setlist since it was read: reload it, then change it again. */
export class SetlistOutdatedError extends AppError {
  constructor() {
    super("setlist_outdated", "The setlist changed since it was read: reload it");
  }
}

/** A song that isn't one of the band's. */
export class UnknownSongError extends AppError {
  constructor() {
    super("bad_request", "Unknown song");
  }
}

/** Only the band leader and the setlist's author delete it. */
export class SetlistDeleteForbiddenError extends AppError {
  constructor() {
    super("forbidden", "Only the band leader and its author delete a setlist");
  }
}

export type Member = { bandId: string; userId: string };

const columns = {
  id: setlists.id,
  title: setlists.title,
  createdById: setlists.createdById,
  version: setlists.version,
  archivedAt: setlists.archivedAt,
  createdAt: setlists.createdAt,
  updatedAt: setlists.updatedAt,
};

/** With who created it: their current display name, null once their account is deleted. */
const withAuthor = { ...columns, createdBy: users.name };

/** A band's current setlists, or its archived ones, the latest changed first, with their summary. */
export async function listSetlists(db: Db, bandId: string, { archived = false } = {}) {
  const rows = await db
    .select(withAuthor)
    .from(setlists)
    .leftJoin(users, eq(users.id, setlists.createdById))
    .where(
      and(
        eq(setlists.bandId, bandId),
        archived ? isNotNull(setlists.archivedAt) : isNull(setlists.archivedAt),
      ),
    )
    .orderBy(desc(setlists.updatedAt), asc(setlists.id));
  const summaries = await summariesOf(
    db,
    bandId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, ...summaries(row.id) }));
}

/**
 * How many parts and songs each setlist has, and how long it lasts (`setlistDuration`: the
 * seconds counted, and the songs without a duration).
 */
async function summariesOf(db: Db, bandId: string, ids: readonly string[]) {
  const [parts, entries] = ids.length
    ? await Promise.all([
        db
          .select({ setlistId: setlistParts.setlistId, count: count() })
          .from(setlistParts)
          .where(inArray(setlistParts.setlistId, [...ids]))
          .groupBy(setlistParts.setlistId),
        db
          .select({ setlistId: setlistSongs.setlistId, songId: setlistSongs.songId })
          .from(setlistSongs)
          .where(inArray(setlistSongs.setlistId, [...ids])),
      ])
    : [[], []];
  const songs = await setlistSongsOf(
    db,
    bandId,
    entries.map((entry) => entry.songId),
  );
  return (id: string) => {
    const played = entries
      .filter((entry) => entry.setlistId === id)
      .flatMap((entry) => songs.get(entry.songId) ?? []);
    return {
      parts: parts.find((part) => part.setlistId === id)?.count ?? 0,
      songs: played.length,
      duration: setlistDuration(played),
    };
  };
}

/**
 * A setlist's parts in order, each with its name and its songs in order, as a setlist shows them
 * (title, artist, durations, status, energy, archived).
 */
export async function setlistContent(db: Db | Tx, bandId: string, setlistId: string) {
  const parts = await db
    .select({ id: setlistParts.id, name: setlistParts.name })
    .from(setlistParts)
    .where(eq(setlistParts.setlistId, setlistId))
    .orderBy(asc(setlistParts.position));
  const entries = await db
    .select({ partId: setlistSongs.partId, songId: setlistSongs.songId })
    .from(setlistSongs)
    .where(eq(setlistSongs.setlistId, setlistId))
    .orderBy(asc(setlistSongs.position));
  const songs = await setlistSongsOf(
    db,
    bandId,
    entries.map((entry) => entry.songId),
  );
  return parts.map((part) => ({
    name: part.name,
    songs: entries
      .filter((entry) => entry.partId === part.id)
      .flatMap((entry): SetlistSong[] => {
        const song = songs.get(entry.songId);
        return song ? [song] : [];
      }),
  }));
}

/**
 * Every setlist of a band, current and archived, with its content (#274): the web app keeps them
 * for offline use. The latest changed first.
 */
export async function setlistDetails(db: Db, bandId: string) {
  const rows = await db
    .select(withAuthor)
    .from(setlists)
    .leftJoin(users, eq(users.id, setlists.createdById))
    .where(eq(setlists.bandId, bandId))
    .orderBy(desc(setlists.updatedAt), asc(setlists.id));
  const parts = await db
    .select({ id: setlistParts.id, setlistId: setlistParts.setlistId, name: setlistParts.name })
    .from(setlistParts)
    .where(eq(setlistParts.bandId, bandId))
    .orderBy(asc(setlistParts.position));
  const entries = await db
    .select({ partId: setlistSongs.partId, songId: setlistSongs.songId })
    .from(setlistSongs)
    .where(eq(setlistSongs.bandId, bandId))
    .orderBy(asc(setlistSongs.position));
  const songs = await setlistSongsOf(
    db,
    bandId,
    entries.map((entry) => entry.songId),
  );
  return rows.map((row) => ({
    ...row,
    parts: parts
      .filter((part) => part.setlistId === row.id)
      .map((part) => ({
        name: part.name,
        songs: entries
          .filter((entry) => entry.partId === part.id)
          .flatMap((entry): SetlistSong[] => {
            const song = songs.get(entry.songId);
            return song ? [song] : [];
          }),
      })),
  }));
}

/** A setlist with its content, or null. */
export async function getSetlistWithContent(db: Db, bandId: string, id: string) {
  const setlist = await getSetlist(db, bandId, id);
  return setlist ? { ...setlist, parts: await setlistContent(db, bandId, id) } : null;
}

/** A setlist's content as saved: its parts in order, each with its songs' ids in order. */
export type SetlistContent = { name: string | null; songs: string[] }[];

/** Replaces a setlist's parts and songs (its songs must be the band's). */
async function writeContent(tx: Tx, bandId: string, setlistId: string, parts: SetlistContent) {
  const ids = parts.flatMap((part) => part.songs);
  const known = await setlistSongsOf(tx, bandId, ids);
  if (ids.some((id) => !known.has(id))) throw new UnknownSongError();
  await tx.delete(setlistParts).where(eq(setlistParts.setlistId, setlistId));
  const inserted = await tx
    .insert(setlistParts)
    .values(parts.map((part, position) => ({ bandId, setlistId, position, name: part.name })))
    .returning({ id: setlistParts.id, position: setlistParts.position });
  const rows = parts.flatMap((part, partPosition) => {
    const partId = inserted.find((row) => row.position === partPosition)?.id ?? "";
    return part.songs.map((songId, position) => ({ bandId, setlistId, partId, position, songId }));
  });
  if (rows.length > 0) await tx.insert(setlistSongs).values(rows);
}

/** One `setlist.updated` per member and setlist within this time: saves come at each change. */
export const UPDATE_EVENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * A member saves a setlist's whole content (#272), read at `version`: refused when someone saved
 * since (SetlistOutdatedError), or when it's archived. Raises the version; records
 * `setlist.updated`, once per member within UPDATE_EVENT_WINDOW_MS. Returns the setlist with its
 * content, or null when the band has no such setlist.
 */
export async function saveSetlistContent(
  db: Db,
  member: Member,
  id: string,
  { version, parts }: { version: number; parts: SetlistContent },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ version: setlists.version, archivedAt: setlists.archivedAt })
      .from(setlists)
      .where(and(eq(setlists.bandId, member.bandId), eq(setlists.id, id)))
      .for("update");
    if (!current) return null;
    if (current.archivedAt) throw new SetlistArchivedError();
    if (current.version !== version) throw new SetlistOutdatedError();
    await writeContent(tx, member.bandId, id, parts);
    await tx
      .update(setlists)
      .set({ version: sql`${setlists.version} + 1` })
      .where(eq(setlists.id, id));
    const [recent] = await tx
      .select({ id: activity.id })
      .from(activity)
      .where(
        and(
          eq(activity.targetId, id),
          eq(activity.action, "setlist.updated"),
          eq(activity.actorId, member.userId),
          gt(activity.createdAt, new Date(Date.now() - UPDATE_EVENT_WINDOW_MS)),
        ),
      )
      .limit(1);
    if (!recent) {
      await recordActivity(tx, {
        action: "setlist.updated",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "setlist", id },
      });
    }
    const setlist = await getSetlist(tx, member.bandId, id);
    return setlist ? { ...setlist, parts: await setlistContent(tx, member.bandId, id) } : null;
  });
}

/** One setlist of a band, or null. */
export async function getSetlist(db: Db | Tx, bandId: string, id: string) {
  const [setlist] = await db
    .select(withAuthor)
    .from(setlists)
    .leftJoin(users, eq(users.id, setlists.createdById))
    .where(and(eq(setlists.bandId, bandId), eq(setlists.id, id)));
  return setlist ?? null;
}

/** How many current setlists the band has (archived ones don't count). */
async function currentCount(tx: Tx, bandId: string) {
  const [row] = await tx
    .select({ count: count() })
    .from(setlists)
    .where(and(eq(setlists.bandId, bandId), isNull(setlists.archivedAt)));
  return row?.count ?? 0;
}

/**
 * Locks the band's setlists, so two requests can't both pass the limit: a transaction-scoped
 * advisory lock on the band.
 */
async function lockBand(tx: Tx, bandId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`setlists:${bandId}`}))`);
}

/** Throws TooManySetlistsError when the band can't have one more current setlist. */
export async function checkSetlistRoom(tx: Tx, bandId: string) {
  await lockBand(tx, bandId);
  if ((await currentCount(tx, bandId)) >= SETLIST_LIMITS.perBand) {
    throw new TooManySetlistsError();
  }
}

/** A title taken by another setlist of the band becomes SetlistTitleTakenError. */
async function titleChecked<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    throw isUniqueViolation(error, "setlists_band_title_lower_unique")
      ? new SetlistTitleTakenError()
      : error;
  }
}

/** Inserts a setlist with its content, records `setlist.created`, and returns it with its content. */
async function insertSetlist(
  tx: Tx,
  member: Member,
  title: string,
  parts: SetlistContent,
  data?: Record<string, string>,
) {
  const [setlist] = await tx
    .insert(setlists)
    .values({ bandId: member.bandId, title, createdById: member.userId })
    .returning({ id: setlists.id });
  if (!setlist) throw new Error("Setlist not inserted");
  await writeContent(tx, member.bandId, setlist.id, parts);
  await recordActivity(tx, {
    action: "setlist.created",
    bandId: member.bandId,
    actorId: member.userId,
    target: { type: "setlist", id: setlist.id },
    ...(data ? { data } : {}),
  });
  const created = await getSetlist(tx, member.bandId, setlist.id);
  return created
    ? { ...created, parts: await setlistContent(tx, member.bandId, setlist.id) }
    : null;
}

/** A member creates a setlist; it starts with one unnamed, empty part. */
export function createSetlist(db: Db, member: Member, title: string) {
  return titleChecked(() =>
    db.transaction(async (tx) => {
      await checkSetlistRoom(tx, member.bandId);
      return insertSetlist(tx, member, title, [{ name: null, songs: [] }]);
    }),
  );
}

/** A setlist's content as stored: its parts' names and song ids, in order. */
async function storedContent(tx: Tx, setlistId: string): Promise<SetlistContent> {
  const parts = await tx
    .select({ id: setlistParts.id, name: setlistParts.name })
    .from(setlistParts)
    .where(eq(setlistParts.setlistId, setlistId))
    .orderBy(asc(setlistParts.position));
  const entries = await tx
    .select({ partId: setlistSongs.partId, songId: setlistSongs.songId })
    .from(setlistSongs)
    .where(eq(setlistSongs.setlistId, setlistId))
    .orderBy(asc(setlistSongs.position));
  return parts.map((part) => ({
    name: part.name,
    songs: entries.filter((entry) => entry.partId === part.id).map((entry) => entry.songId),
  }));
}

/**
 * The first title of `title`, `title 2`, `title 3`… that no setlist of the band has (case
 * ignored), within SETLIST_MAX_LENGTH.title.
 */
async function freeTitle(tx: Tx, bandId: string, title: string) {
  const rows = await tx
    .select({ title: setlists.title })
    .from(setlists)
    .where(eq(setlists.bandId, bandId));
  const taken = new Set(rows.map((row) => row.title.toLowerCase()));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` ${n}`;
    const candidate = `${title.slice(0, SETLIST_MAX_LENGTH.title - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * A member duplicates a setlist (#273), archived ones too: a new current setlist with the same
 * parts and songs, the member as its author, titled `title` (the web app's "… (copy)"), or
 * `title 2`, `title 3`… when taken. Within the band's limit. Null when there's no such setlist.
 */
export function duplicateSetlist(db: Db, member: Member, id: string, title: string) {
  return titleChecked(() =>
    db.transaction(async (tx) => {
      const [source] = await tx
        .select({ id: setlists.id })
        .from(setlists)
        .where(and(eq(setlists.bandId, member.bandId), eq(setlists.id, id)));
      if (!source) return null;
      await checkSetlistRoom(tx, member.bandId);
      return insertSetlist(
        tx,
        member,
        await freeTitle(tx, member.bandId, title),
        await storedContent(tx, id),
        { from: id },
      );
    }),
  );
}

/** Locks one setlist of the band for a change; null when the band has none with this id. */
async function lockSetlist(tx: Tx, bandId: string, id: string) {
  const [setlist] = await tx
    .select({
      title: setlists.title,
      archivedAt: setlists.archivedAt,
      createdById: setlists.createdById,
    })
    .from(setlists)
    .where(and(eq(setlists.bandId, bandId), eq(setlists.id, id)))
    .for("update");
  return setlist ?? null;
}

/** A member renames a setlist (not an archived one). Returns it, or null when there's none. */
export function renameSetlist(db: Db, member: Member, id: string, title: string) {
  return titleChecked(() =>
    db.transaction(async (tx) => {
      const current = await lockSetlist(tx, member.bandId, id);
      if (!current) return null;
      if (current.archivedAt) throw new SetlistArchivedError();
      if (current.title !== title) {
        await tx.update(setlists).set({ title }).where(eq(setlists.id, id));
        await recordActivity(tx, {
          action: "setlist.renamed",
          bandId: member.bandId,
          actorId: member.userId,
          target: { type: "setlist", id },
        });
      }
      return getSetlist(tx, member.bandId, id);
    }),
  );
}

/**
 * A member archives a setlist (read-only, listed apart) or restores it, within the band's limit.
 * Returns it, or null when there's none. Archiving an archived setlist changes nothing.
 */
export function setSetlistArchived(db: Db, member: Member, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    const current = await lockSetlist(tx, member.bandId, id);
    if (!current) return null;
    if ((current.archivedAt !== null) !== archived) {
      if (!archived) await checkSetlistRoom(tx, member.bandId);
      await tx
        .update(setlists)
        .set({ archivedAt: archived ? new Date() : null })
        .where(eq(setlists.id, id));
      await recordActivity(tx, {
        action: archived ? "setlist.archived" : "setlist.restored",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "setlist", id },
      });
    }
    return getSetlist(tx, member.bandId, id);
  });
}

/**
 * Deletes a setlist for good: the band leader, or its author. Returns false when the band has no
 * such setlist.
 */
export function deleteSetlist(db: Db, member: Member & { isLeader: boolean }, id: string) {
  return db.transaction(async (tx) => {
    const current = await lockSetlist(tx, member.bandId, id);
    if (!current) return false;
    if (!member.isLeader && current.createdById !== member.userId) {
      throw new SetlistDeleteForbiddenError();
    }
    await tx.delete(setlists).where(eq(setlists.id, id));
    await recordActivity(tx, {
      action: "setlist.deleted",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "setlist", id },
    });
    return true;
  });
}

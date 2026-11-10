import { SETLIST_LIMITS } from "@coverband/shared";
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { isUniqueViolation } from "../../core/db/pg-errors";
import { setlists, users } from "../../core/db/schema";
import { AppError } from "../../core/errors";

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

/** A band's current setlists, or its archived ones; the latest changed first. */
export function listSetlists(db: Db, bandId: string, { archived = false } = {}) {
  return db
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

/** A member creates a setlist; it starts empty. */
export function createSetlist(db: Db, member: Member, title: string) {
  return titleChecked(() =>
    db.transaction(async (tx) => {
      await checkSetlistRoom(tx, member.bandId);
      const [setlist] = await tx
        .insert(setlists)
        .values({ bandId: member.bandId, title, createdById: member.userId })
        .returning({ id: setlists.id });
      if (!setlist) throw new Error("Setlist not inserted");
      await recordActivity(tx, {
        action: "setlist.created",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "setlist", id: setlist.id },
      });
      return getSetlist(tx, member.bandId, setlist.id);
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

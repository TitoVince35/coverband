import { DOCUMENT_LIMITS } from "@coverband/shared";
import { and, asc, count, countDistinct, gte, isNull } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { sessions, users } from "../../core/db/schema";
import type { AppDeps } from "../../deps";
import { adminBandOf, allMemberships, countBands, deleteDisabledBand } from "../bands/service";
import { countPendingInvitations } from "../invitations/service";
import { bandJournal, type JournalSource } from "../journal/service";
import { lineupOf } from "../members/service";
import { bandDocumentKeys, bandRepertoireTotals, repertoireTotals } from "../songs/service";

/** How many of a band's latest events its admin page shows. */
export const ADMIN_JOURNAL_SIZE = 20;

/**
 * A band's admin page (#247): the band, its lineup (no avatars: their route isn't on the admin
 * host), its songs and documents, the storage its documents use out of its quota, its journal.
 * Undefined when there's no such band.
 */
export async function adminBandDetails(db: Db, id: string, sources: readonly JournalSource[]) {
  const band = await adminBandOf(db, id);
  if (!band) return undefined;
  const [lineup, totals, journal] = await Promise.all([
    lineupOf(db, id),
    bandRepertoireTotals(db, id),
    bandJournal(db, id, sources, ADMIN_JOURNAL_SIZE),
  ]);
  return {
    ...band,
    lineup: lineup.map(({ avatarUrl: _, ...member }) => member),
    songs: totals.songs,
    documents: totals.documents,
    storage: { usedBytes: totals.documentsBytes, quotaBytes: DOCUMENT_LIMITS.perBand },
    journal,
  };
}

/**
 * An admin deletes a disabled band for good (#248), its name typed to confirm: the band and
 * everything in it in one transaction, then its files in storage (documents, logo). A file that
 * can't be deleted is only an orphan: logged, the deletion stands.
 */
export async function deleteBand(
  { db, storage, log }: Pick<AppDeps, "db" | "storage" | "log">,
  id: string,
  name: string,
  actorId: string,
) {
  const keys = await db.transaction(async (tx) => {
    const documents = await bandDocumentKeys(tx, id);
    const logo = await deleteDisabledBand(tx, id, name, actorId);
    return [...documents, ...logo];
  });
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (error) {
      log.warn("A deleted band's file was not deleted", { key, err: error });
    }
  }
}

/** A user counts as active with a session used within this many days. */
export const ACTIVE_DAYS = 30;

/**
 * The admin console's homepage numbers (#246). New bands: since the 1st of `now`'s month (UTC).
 * Documents quota: every band's storage budget added up.
 */
export async function adminStats(db: Db, now: Date) {
  const activeSince = new Date(now.getTime() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [bands, repertoire, pendingInvitations, [userRow], [activeRow]] = await Promise.all([
    countBands(db, monthStart),
    repertoireTotals(db),
    countPendingInvitations(db, now),
    db.select({ count: count() }).from(users),
    // An admin viewing the app as someone (#214) doesn't make them active.
    db
      .select({ count: countDistinct(sessions.userId) })
      .from(sessions)
      .where(and(gte(sessions.updatedAt, activeSince), isNull(sessions.impersonatedBy))),
  ]);
  return {
    bands: bands.total,
    newBandsThisMonth: bands.since,
    users: userRow?.count ?? 0,
    activeUsers: activeRow?.count ?? 0,
    ...repertoire,
    documentsQuotaBytes: bands.total * DOCUMENT_LIMITS.perBand,
    pendingInvitations,
  };
}

/** Every account, oldest first, with its bands (by name) and its role in each: the admin console. */
export async function usersWithBands(db: Db) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
  const memberships = await allMemberships(db);
  return rows.map((user) => ({
    ...user,
    bands: memberships.filter((m) => m.userId === user.id).map(({ userId: _, ...band }) => band),
  }));
}

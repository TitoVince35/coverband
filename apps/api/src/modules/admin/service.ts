import { DOCUMENT_LIMITS } from "@coverband/shared";
import { and, asc, count, countDistinct, gte, isNull } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { sessions, users } from "../../core/db/schema";
import { allMemberships, countBands } from "../bands/service";
import { countPendingInvitations } from "../invitations/service";
import { repertoireTotals } from "../songs/service";

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

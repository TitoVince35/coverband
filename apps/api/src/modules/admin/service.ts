import { ADMIN_ROLE, DOCUMENT_LIMITS } from "@coverband/shared";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  max,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db } from "../../core/db/client";
import { sessions, users } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import type { AppDeps } from "../../deps";
import {
  adminBandOf,
  bandMemberIds,
  bandOf,
  bandsLedAlone,
  countBands,
  deleteDisabledBand,
  membershipsOfUsers,
} from "../bands/service";
import { instrumentsOfUsers } from "../instruments/service";
import {
  countPendingInvitations,
  invitationLanguageOf,
  pendingInvitationsFor,
} from "../invitations/service";
import { bandJournal, type JournalSource } from "../journal/service";
import { lineupOf } from "../members/service";
import { ownAvatarKey } from "../profile/service";
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

/** How the admin console sorts users (#249). */
export const ADMIN_USER_SORTS = ["name", "email", "createdAt"] as const;

/** A page of the admin console's user list: `q` searches the email and names. */
export type AdminUserQuery = {
  page: number;
  perPage: number;
  sort: (typeof ADMIN_USER_SORTS)[number];
  order: "asc" | "desc";
  q?: string | undefined;
  /** Only admins. */
  admins?: boolean | undefined;
  /** Only users in no band. */
  bandless?: boolean | undefined;
};

/** `%` and `_` typed in a search are matched as themselves. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A page of users for the admin console (#249), whatever their band: names, role, blocked or
 * not, their bands (with their role in each) and their instruments across them, without duplicates.
 */
export async function adminUserPage(db: Db, query: AdminUserQuery) {
  const conditions: (SQL | undefined)[] = [];
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(
      or(
        ilike(users.email, pattern),
        ilike(users.name, pattern),
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
      ),
    );
  }
  if (query.admins) conditions.push(eq(users.role, ADMIN_ROLE));
  if (query.bandless) conditions.push(notInArray(users.id, bandMemberIds(db)));
  const where = and(...conditions);
  const sortColumn = {
    name: sql`lower(${users.name})`,
    email: users.email,
    createdAt: users.createdAt,
  }[query.sort];
  const direction = query.order === "desc" ? desc : asc;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        banned: users.banned,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(direction(sortColumn), asc(users.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ count: count() }).from(users).where(where),
  ]);
  const ids = rows.map((row) => row.id);
  const [bands, instruments] = await Promise.all([
    membershipsOfUsers(db, ids),
    instrumentsOfUsers(db, ids),
  ]);
  return {
    data: rows.map((row) => ({
      ...row,
      banned: row.banned ?? false,
      bands: bands.get(row.id) ?? [],
      instruments: instruments.get(row.id) ?? [],
    })),
    total: total?.count ?? 0,
  };
}

/**
 * A user's admin page (#249): profile, bands with their role, instruments, last session (an
 * admin's impersonation left out), the invitations still waiting for their email, and where the
 * web app views the app as them (`impersonateUrl`: not for an admin, nor oneself). Undefined when
 * there's no such user.
 */
export async function adminUserDetails(
  { db, appUrl }: Pick<AppDeps, "db" | "appUrl">,
  id: string,
  viewerId: string,
  now: Date,
) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      nickname: users.nickname,
      role: users.role,
      banned: users.banned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!user) return undefined;
  const [bands, instruments, [lastSession], invitations] = await Promise.all([
    membershipsOfUsers(db, [id]),
    instrumentsOfUsers(db, [id]),
    db
      .select({ at: max(sessions.updatedAt) })
      .from(sessions)
      .where(and(eq(sessions.userId, id), isNull(sessions.impersonatedBy))),
    pendingInvitationsFor(db, user.email, now),
  ]);
  const pendingInvitations = await Promise.all(
    invitations.map(async ({ bandId, ...invitation }) => ({
      ...invitation,
      band: bandId ? ((await bandOf(db, bandId))?.name ?? null) : null,
    })),
  );
  const viewable = user.role !== ADMIN_ROLE && user.id !== viewerId;
  return {
    ...user,
    banned: user.banned ?? false,
    bands: bands.get(id) ?? [],
    instruments: instruments.get(id) ?? [],
    lastSessionAt: lastSession?.at ?? null,
    pendingInvitations,
    impersonateUrl: viewable ? `${appUrl}/impersonate/${id}` : null,
  };
}

export class OnlyBandLeaderError extends AppError {
  constructor(bands: readonly string[]) {
    super("only_band_leader", "This user is the only band leader of a band", {
      bands: bands.join(", "),
    });
  }
}

const userNotFound = () => new AppError("not_found", "User not found");

/** What an admin may do to this user: not to oneself, nor to another admin. */
async function targetUser(db: Db, id: string, actorId: string) {
  const [user] = await db
    .select({ id: users.id, role: users.role, image: users.image, banned: users.banned })
    .from(users)
    .where(eq(users.id, id));
  if (!user) throw userNotFound();
  if (user.id === actorId || user.role === ADMIN_ROLE) {
    throw new AppError("forbidden", "Not on an admin, nor on oneself");
  }
  return user;
}

/**
 * An admin blocks a user (#249), or unblocks them: Better Auth's admin plugin then refuses their
 * logins (its `banned` flag), and blocking ends their sessions. Recorded as `user.banned` /
 * `user.unbanned`; doing it twice changes nothing.
 */
export async function setUserBanned(db: Db, id: string, banned: boolean, actorId: string) {
  const user = await targetUser(db, id, actorId);
  if ((user.banned ?? false) === banned) return;
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ banned, banReason: null, banExpires: null })
      .where(eq(users.id, id));
    if (banned) await tx.delete(sessions).where(eq(sessions.userId, id));
    await recordActivity(tx, {
      action: banned ? "user.banned" : "user.unbanned",
      bandId: null,
      actorId,
      target: { type: "user", id },
    });
  });
}

/**
 * An admin deletes a user for good (#249), unless they lead a band alone (409
 * `only_band_leader`, the bands in the details): their account, sessions and memberships go
 * (cascade), the activity they did stays without them. Then their avatar's file. Recorded as
 * `user.deleted`, with no name nor email.
 */
export async function deleteUser(
  { db, storage, log }: Pick<AppDeps, "db" | "storage" | "log">,
  id: string,
  actorId: string,
) {
  const user = await targetUser(db, id, actorId);
  await db.transaction(async (tx) => {
    const alone = await bandsLedAlone(tx, id);
    if (alone.length > 0) throw new OnlyBandLeaderError(alone.map((band) => band.name));
    await tx.delete(users).where(eq(users.id, id));
    await recordActivity(tx, {
      action: "user.deleted",
      bandId: null,
      actorId,
      target: { type: "user", id },
    });
  });
  const avatar = ownAvatarKey(id, user.image);
  if (avatar) {
    try {
      await storage.delete(avatar);
    } catch (error) {
      log.warn("A deleted user's avatar was not deleted", { key: avatar, err: error });
    }
  }
}

/**
 * An admin sends a user Better Auth's password reset email (#249): the same link as "Forgot
 * password?", in the language of the user's latest invitation (users have no language of their own).
 */
export async function sendPasswordReset({ db, auth }: Pick<AppDeps, "db" | "auth">, id: string) {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
  if (!user) throw userNotFound();
  const language = await invitationLanguageOf(db, user.email);
  await auth.api.requestPasswordReset({
    body: { email: user.email },
    headers: new Headers({ "accept-language": language }),
  });
}

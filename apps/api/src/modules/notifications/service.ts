import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db } from "../../core/db/client";
import { notificationReads, notifications, pushSubscriptions, users } from "../../core/db/schema";

/**
 * Sends a note from the app's team (#260): every user whose account exists now sees it, in a
 * modal, until they read it.
 */
export async function sendTeamNote(db: Db, text: string, adminId: string) {
  return db.transaction(async (tx) => {
    const [note] = await tx
      .insert(notifications)
      .values({ kind: "admin-modal", sender: "team", text, sentById: adminId })
      .returning({ id: notifications.id });
    if (!note) throw new Error("Notification not inserted");
    await recordActivity(tx, {
      action: "notification.sent",
      bandId: null,
      actorId: adminId,
      target: { type: "notification", id: note.id },
      data: { kind: "admin-modal" },
    });
    return note;
  });
}

/** The admin app's list of sent notes, newest first, with how many of their recipients read them. */
export async function teamNotePage(db: Db, query: { page: number; perPage: number }) {
  const recipients = sql<number>`(select count(*) from ${users} where ${users.createdAt} < ${notifications.sentAt})`;
  const readers = sql<number>`(select count(*) from ${notificationReads} where ${notificationReads.notificationId} = ${notifications.id})`;
  const where = eq(notifications.kind, "admin-modal");
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        text: notifications.text,
        sentAt: notifications.sentAt,
        sentBy: users.name,
        recipients: recipients.mapWith(Number),
        readers: readers.mapWith(Number),
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.sentById))
      .where(where)
      .orderBy(desc(notifications.sentAt), asc(notifications.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ count: count() }).from(notifications).where(where),
  ]);
  return { data: rows, total: total?.count ?? 0 };
}

/** What a user may read: the notifications sent since their account was created. */
const forUser = (userId: string) =>
  sql`${notifications.sentAt} > (select ${users.createdAt} from ${users} where ${users.id} = ${userId})`;

/** A user's unread notifications, oldest first: the app shows them one after another. */
export async function unreadNotifications(db: Db, userId: string) {
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      sender: notifications.sender,
      text: notifications.text,
      sentAt: notifications.sentAt,
    })
    .from(notifications)
    .leftJoin(
      notificationReads,
      and(
        eq(notificationReads.notificationId, notifications.id),
        eq(notificationReads.userId, userId),
      ),
    )
    .where(and(forUser(userId), isNull(notificationReads.userId)))
    .orderBy(asc(notifications.sentAt), asc(notifications.id));
}

/**
 * Marks a notification read for the user, on all their devices. False when it isn't one of theirs
 * (unknown, or sent before their account existed). Reading it again changes nothing.
 */
export async function markNotificationRead(db: Db, userId: string, notificationId: string) {
  return db.transaction(async (tx) => {
    const [visible] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), forUser(userId)));
    if (!visible) return false;
    const [read] = await tx
      .insert(notificationReads)
      .values({ notificationId, userId })
      .onConflictDoNothing()
      .returning({ readAt: notificationReads.readAt });
    if (read) {
      await recordActivity(tx, {
        action: "notification.read",
        bandId: null,
        actorId: userId,
        target: { type: "notification", id: notificationId },
      });
    }
    return true;
  });
}

/**
 * Saves a device's push subscription (#261). An endpoint already known (the device's browser
 * logged in as someone else since) moves to this user with its new keys.
 */
export async function savePushSubscription(
  db: Db,
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  const { endpoint, keys } = subscription;
  await db.transaction(async (tx) => {
    await tx
      .insert(pushSubscriptions)
      .values({ userId, endpoint, ...keys })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, ...keys, createdAt: sql`now()` },
      });
    await recordActivity(tx, {
      action: "user.push_enabled",
      bandId: null,
      actorId: userId,
      target: { type: "user", id: userId },
    });
  });
}

/** Deletes one of the user's push subscriptions: the device turned them off, or logs out. */
export async function removePushSubscription(db: Db, userId: string, endpoint: string) {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .returning({ id: pushSubscriptions.id });
    if (!removed.length) return;
    await recordActivity(tx, {
      action: "user.push_disabled",
      bandId: null,
      actorId: userId,
      target: { type: "user", id: userId },
    });
  });
}

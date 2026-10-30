import type { Language } from "@coverband/shared";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  isPushService,
  type PushResult,
  type PushSender,
  pushServiceName,
} from "../../adapters/push";
import { recordActivity } from "../../core/activity/record";
import type { Db } from "../../core/db/client";
import {
  notificationReads,
  notifications,
  pushDeliveries,
  pushSubscriptions,
  users,
} from "../../core/db/schema";
import type { Logger } from "../../core/log";

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
  const devices = (status: PushResult) =>
    sql<number>`(select count(*) from ${pushDeliveries} where ${pushDeliveries.notificationId} = ${notifications.id} and ${pushDeliveries.status} = ${status})`.mapWith(
      Number,
    );
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
        // Pushed to (#262): delivered to their push service, or not.
        devicesReached: devices("sent"),
        devicesFailed: devices("failed"),
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
  subscription: { endpoint: string; keys: { p256dh: string; auth: string }; language: Language },
) {
  const { endpoint, keys, language } = subscription;
  await db.transaction(async (tx) => {
    await tx
      .insert(pushSubscriptions)
      .values({ userId, endpoint, ...keys, language })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, ...keys, language, createdAt: sql`now()` },
      });
    await recordActivity(tx, {
      action: "user.push_enabled",
      bandId: null,
      actorId: userId,
      target: { type: "user", id: userId },
    });
  });
}

/** How many devices each of these users has push notifications on, for the admin app (#263). */
export async function pushDeviceCounts(db: Db, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ userId: pushSubscriptions.userId, devices: count() })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds))
    .groupBy(pushSubscriptions.userId);
  return new Map(rows.map((row) => [row.userId, row.devices]));
}

/**
 * A user's devices with push notifications on, oldest first, for the admin app (#263): their push
 * service's name, never the endpoint (whoever has it can send to the device).
 */
export async function pushDevicesOf(db: Db, userId: string) {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      language: pushSubscriptions.language,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id));
  return rows.map(({ endpoint, ...row }) => ({ ...row, service: pushServiceName(endpoint) }));
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

/** Who a team note says it comes from, in the device's language (brief 025: written as is). */
const TEAM_SIGNATURE: Record<Language, string> = {
  en: "The Coverband team",
  fr: "L'équipe Coverband",
};

/** A push's text: the note's start; the whole note shows in the app. */
export const PUSH_BODY_MAX_LENGTH = 200;

/** Pushes sent at once: a few hundred devices take a few seconds (study 022). */
const PUSH_CONCURRENCY = 20;

/** The note's start, cut at a word, for a push's body. */
export function pushBody(text: string) {
  if (text.length <= PUSH_BODY_MAX_LENGTH) return text;
  const cut = text.slice(0, PUSH_BODY_MAX_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > PUSH_BODY_MAX_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Pushes a team note to every subscribed device (#262), during the admin's request: each push
 * service gets it within seconds, opening the app shows the note. One delivery row per device;
 * devices their push service says are gone are deleted; failures are logged (the note itself is
 * already sent: the app shows it anyway). Returns how many devices it reached and missed.
 */
export async function pushTeamNote(
  deps: { db: Db; log: Logger; push: { sender: PushSender; serviceHosts: readonly string[] } },
  note: { id: string; text: string },
) {
  const { db, log, push } = deps;
  const subscriptions = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      language: pushSubscriptions.language,
    })
    .from(pushSubscriptions);
  // Only the push services allowed now (a fake one's leftovers in development stay out).
  const targets = subscriptions.filter((target) =>
    isPushService(target.endpoint, push.serviceHosts),
  );
  const body = pushBody(note.text);
  const results: { endpoint: string; status: PushResult }[] = [];
  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const target = targets[next++];
      if (!target) return;
      const payload = JSON.stringify({ title: TEAM_SIGNATURE[target.language], body, url: "/" });
      const { result, error } = await push.sender.send(target, payload);
      if (result === "failed") {
        log.error("Push failed", {
          notificationId: note.id,
          pushService: URL.parse(target.endpoint)?.hostname,
          err: error,
        });
      }
      results.push({ endpoint: target.endpoint, status: result });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, targets.length) }, worker));
  if (results.length) {
    await db.transaction(async (tx) => {
      await tx
        .insert(pushDeliveries)
        .values(results.map((delivery) => ({ notificationId: note.id, ...delivery })));
      const gone = results.filter((delivery) => delivery.status === "gone");
      if (gone.length) {
        await tx.delete(pushSubscriptions).where(
          inArray(
            pushSubscriptions.endpoint,
            gone.map((delivery) => delivery.endpoint),
          ),
        );
      }
    });
  }
  return {
    reached: results.filter((delivery) => delivery.status === "sent").length,
    failed: results.filter((delivery) => delivery.status === "failed").length,
  };
}

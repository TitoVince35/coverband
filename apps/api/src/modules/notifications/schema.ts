import { NOTIFICATION_KINDS, NOTIFICATION_SENDERS } from "@coverband/shared";
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";

export const notificationKind = pgEnum("notification_kind", NOTIFICATION_KINDS);

export const notificationSender = pgEnum("notification_sender", NOTIFICATION_SENDERS);

/**
 * Notifications (#260, brief 025). An `admin-modal` note goes to every user whose account existed
 * when it was sent; the app shows it until they read it.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().defaultRandom().primaryKey(),
    kind: notificationKind().notNull(),
    sender: notificationSender().notNull(),
    // Plain text, as typed (one language).
    text: text().notNull(),
    // The admin who sent it. Kept as null when the account is deleted.
    sentById: uuid().references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.sentAt)],
);

/** Who read which notification: once per user, whichever device they read it on. */
export const notificationReads = pgTable(
  "notification_reads",
  {
    notificationId: uuid()
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.notificationId, table.userId] })],
);

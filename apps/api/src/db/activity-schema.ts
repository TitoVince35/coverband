import type { ActivityAction, ActivityTarget } from "@coverband/shared";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { bands } from "./band-schema";

/**
 * Functional events (#43): base for stats and the future activity feed. One row per write,
 * recorded with `recordActivity` in the same transaction as the change. IDs only: no emails or
 * names in `data`.
 */
export const activity = pgTable(
  "activity",
  {
    id: uuid().defaultRandom().primaryKey(),
    // Null for events outside a band (a band leader invitation, a new account).
    bandId: uuid().references(() => bands.id, { onDelete: "cascade" }),
    // The user who acted. Kept as null when the account is deleted.
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    // A code from ACTIVITY_ACTIONS (@coverband/shared).
    action: text().$type<ActivityAction>().notNull(),
    targetType: text().$type<ActivityTarget>().notNull(),
    targetId: uuid().notNull(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.bandId, table.createdAt)],
);

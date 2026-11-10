import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";
import { bands } from "../bands/schema";

/**
 * A band's setlists (brief 026, #271): a title, unique within the band whatever its case
 * (archived setlists included), and who created it. Archived setlists are read-only and don't
 * count toward SETLIST_LIMITS.perBand.
 */
export const setlists = pgTable(
  "setlists",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    title: text().notNull(),
    // Who created it ("by Lea"): they may delete it, as the band leader may. Null once their
    // account goes.
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    // Raised by each save of its content (#272): a save made on an older version is refused.
    version: integer().default(1).notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index().on(table.bandId),
    uniqueIndex("setlists_band_title_lower_unique").on(table.bandId, sql`lower(${table.title})`),
  ],
);

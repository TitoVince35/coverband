import { BAND_ROLES } from "@coverband/shared";
import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";

export const bandRole = pgEnum("band_role", BAND_ROLES);

export const bands = pgTable(
  "bands",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    // URL name (/b/:slug), derived from the name with slugify.
    slug: text().notNull().unique(),
    genre: text(),
    // Storage keys of the logo and its thumbnail (bands/{id}/logo/{uuid}.{ext}), both or neither.
    logoKey: text(),
    logoThumbnailKey: text(),
    // Set by an admin (#248): the band is suspended, its members see only that. Null: active.
    disabledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  // Band names are unique regardless of case.
  (table) => [uniqueIndex("bands_name_lower_unique").on(sql`lower(${table.name})`)],
);

/** A user's membership of a band: their role in that band (instruments: memberInstruments). */
export const bandMembers = pgTable(
  "band_members",
  {
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: bandRole().notNull(),
    joinedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.bandId, table.userId] }), index().on(table.userId)],
);

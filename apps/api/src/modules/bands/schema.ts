import { BAND_ROLES, LOGO_BACKGROUNDS } from "@coverband/shared";
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
export const logoBackground = pgEnum("logo_background", LOGO_BACKGROUNDS);

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
    logoBackground: logoBackground().default("light").notNull(),
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

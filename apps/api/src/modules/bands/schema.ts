import { BAND_ROLES } from "@coverband/shared";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
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

/**
 * What a member plays in a band, in order (the first is their main instrument): a known code from
 * INSTRUMENTS (@coverband/shared), or free text for the others, never both.
 */
export const memberInstruments = pgTable(
  "member_instruments",
  {
    bandId: uuid().notNull(),
    userId: uuid().notNull(),
    position: smallint().notNull(),
    code: text(),
    label: text(),
  },
  (table) => [
    primaryKey({ columns: [table.bandId, table.userId, table.position] }),
    foreignKey({
      columns: [table.bandId, table.userId],
      foreignColumns: [bandMembers.bandId, bandMembers.userId],
    }).onDelete("cascade"),
    check(
      "member_instruments_code_or_label",
      sql`(${table.code} is null) <> (${table.label} is null)`,
    ),
    // Shared custom instruments: free text grouped across bands.
    index("member_instruments_label_lower_index").on(sql`lower(${table.label})`),
  ],
);

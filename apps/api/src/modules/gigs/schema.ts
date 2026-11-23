import { GIG_STATUSES, GIG_TYPES, type WebLink } from "@coverband/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";
import { bands } from "../bands/schema";

export const gigType = pgEnum("gig_type", GIG_TYPES);
export const gigStatus = pgEnum("gig_status", GIG_STATUSES);

/**
 * A band's venues (brief 034, #326): where its gigs take place. Name and city are unique within
 * the band, case ignored. Shared by the band's gigs: a change shows on every gig there. A venue
 * is deleted only when no gig uses it.
 */
export const venues = pgTable(
  "venues",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    name: text().notNull(),
    city: text().notNull(),
    address: text(),
    links: jsonb().$type<WebLink[]>().default([]).notNull(),
    description: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("venues_band_name_city_lower_unique").on(
      table.bandId,
      sql`lower(${table.name})`,
      sql`lower(${table.city})`,
    ),
  ],
);

/**
 * A band's gigs (brief 034, #326): a date, and a title or a venue (or both). Proposed when
 * created. `date` is the local date of the show: its day runs until GIG_DAY_END_HOUR the next
 * morning (`gigDay`).
 */
export const gigs = pgTable(
  "gigs",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    title: text(),
    type: gigType().default("public").notNull(),
    // `HH:MM`, local time.
    showTime: text(),
    status: gigStatus().default("proposed").notNull(),
    // A venue used by a gig can't be deleted (`no action`, checked at the end of the statement,
    // so deleting a whole band still cascades).
    venueId: uuid().references(() => venues.id, { onDelete: "no action" }),
    // Who created it: they settle, postpone, cancel and delete it, as the band leader does.
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    // Cancelled (#327): why, who and when, shown at the top of the gig. Null otherwise.
    cancelledReason: text(),
    cancelledById: uuid().references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp({ withTimezone: true }),
    // Raised by each save: a save made on an older version is refused.
    version: integer().default(1).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index().on(table.bandId, table.date),
    index().on(table.venueId),
    check("gigs_title_or_venue", sql`${table.title} is not null or ${table.venueId} is not null`),
  ],
);

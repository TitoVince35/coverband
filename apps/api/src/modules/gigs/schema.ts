import { BAND_CONTACT_TYPES, GIG_STATUSES, GIG_TYPES, type WebLink } from "@coverband/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";
import { bands } from "../bands/schema";
import { setlists } from "../setlists/schema";

export const gigType = pgEnum("gig_type", GIG_TYPES);
export const gigStatus = pgEnum("gig_status", GIG_STATUSES);
export const bandContactType = pgEnum("band_contact_type", BAND_CONTACT_TYPES);

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
    // Its setlist (#328), one of the band's; a deleted setlist leaves the gig without one.
    setlistId: uuid().references(() => setlists.id, { onDelete: "set null" }),
    // `HH:MM`, local time.
    getInTime: text(),
    // The program (#328): web links to the show's advertising, free text (running order, occasion).
    programLinks: jsonb().$type<WebLink[]>().default([]).notNull(),
    programNotes: text(),
    // Extra info (#328): the pay in euro cents and its free text, the shared backline, whether
    // technicians are provided, and the gig's notes.
    payCents: integer(),
    payNotes: text(),
    sharedBackline: boolean().default(false).notNull(),
    backlineNotes: text(),
    techniciansProvided: boolean().default(false).notNull(),
    notes: text(),
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
    index().on(table.setlistId),
    check("gigs_title_or_venue", sql`${table.title} is not null or ${table.venueId} is not null`),
  ],
);

/**
 * A band's contacts (#329): the people of its gigs (organizers, technicians, musicians), entered
 * once and linked, never copied: a changed phone number shows on every gig and venue. Other
 * people's personal details: the band deletes them (#334).
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: bandContactType().notNull(),
    phone: text(),
    email: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index().on(table.bandId)],
);

/** A gig's own contacts (#329), in the order they were added; its venue's show before them. */
export const gigContacts = pgTable(
  "gig_contacts",
  {
    gigId: uuid()
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    position: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.gigId, table.contactId] }), index().on(table.contactId)],
);

/** A venue's usual people (#329): shown on every gig at the venue. */
export const venueContacts = pgTable(
  "venue_contacts",
  {
    venueId: uuid()
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    position: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.venueId, table.contactId] }),
    index().on(table.contactId),
  ],
);

/**
 * A gig's posters (#330): images in the band's bucket (`storage_key`), served by the API to the
 * band's members only, deleted with the gig (its service deletes the files).
 */
export const gigPosters = pgTable(
  "gig_posters",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    gigId: uuid()
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    title: text().notNull(),
    contentType: text().notNull(),
    extension: text().notNull(),
    size: integer().notNull(),
    storageKey: text().notNull(),
    // Who added it: they may remove it, as the band leader may. Null once their account goes.
    addedById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.gigId), index().on(table.bandId)],
);

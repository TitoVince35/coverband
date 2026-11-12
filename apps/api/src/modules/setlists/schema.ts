import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";
import { bands } from "../bands/schema";
import { songs } from "../songs/schema";

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

/**
 * A setlist's parts (#272), in order: 1 to SETLIST_LIMITS.parts, each with an optional name
 * ("Set 1", "Encore"; none: "Part 2"). A new setlist has one. Its content is saved whole, so the
 * rows are replaced on each save.
 */
export const setlistParts = pgTable(
  "setlist_parts",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    setlistId: uuid()
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    name: text(),
  },
  (table) => [unique().on(table.setlistId, table.position)],
);

/**
 * The songs of a setlist's parts (#272), in order; the same song may appear twice. A song in a
 * setlist can't be deleted: the foreign key refuses it (`no action`, checked at the end of the
 * statement, so deleting a whole band still cascades), which `deleteSong` turns into
 * `song_in_use`.
 */
export const setlistSongs = pgTable(
  "setlist_songs",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    setlistId: uuid()
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
    partId: uuid()
      .notNull()
      .references(() => setlistParts.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    songId: uuid()
      .notNull()
      .references(() => songs.id, { onDelete: "no action" }),
  },
  (table) => [
    unique().on(table.partId, table.position),
    index().on(table.setlistId),
    index().on(table.songId),
  ],
);

/**
 * A setlist's exported files (brief 030, #297): the latest one per format and language, kept in
 * the band's bucket. `fingerprint` is the hash of everything the file shows: the same one serves
 * the stored file, another makes a new file, which replaces this one (the old file is deleted).
 * Deleting the setlist or the band deletes the rows; their service deletes the files.
 */
export const setlistExports = pgTable(
  "setlist_exports",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    setlistId: uuid()
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
    // A SETLIST_EXPORT_FORMATS code, and a LANGUAGES code.
    format: text().notNull(),
    language: text().notNull(),
    fingerprint: text().notNull(),
    fileKey: text().notNull(),
    size: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.setlistId, table.format, table.language), index().on(table.bandId)],
);

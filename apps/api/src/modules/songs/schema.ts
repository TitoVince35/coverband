import {
  type Instrument,
  LYRICS_SOURCES,
  MAX_ENERGY,
  type MusicalKey,
  SONG_STATUSES,
} from "@coverband/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../adapters/auth-schema";
import { bands } from "../bands/schema";

export const songStatus = pgEnum("song_status", SONG_STATUSES);
export const lyricsSource = pgEnum("lyrics_source", LYRICS_SOURCES);

/**
 * A band's repertoire (#88). Title and artist identify a song, without a unique constraint: a
 * match only warns (a second version is told apart by its title).
 */
export const songs = pgTable(
  "songs",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    title: text().notNull(),
    artist: text().notNull(),
    // In seconds: the original timing, and how long the band takes to play it.
    standardDuration: integer(),
    ownDuration: integer(),
    // Codes from MUSICAL_KEYS (@coverband/shared): the original key, and the band's when it
    // transposes.
    key: text().$type<MusicalKey>(),
    bandKey: text().$type<MusicalKey>(),
    // Beats per minute.
    tempo: smallint(),
    // Free text: the band's earlier styles are suggested.
    style: text(),
    notes: text(),
    // Lyrics (#129) and where they come from; both null when there are none.
    lyrics: text(),
    lyricsSource: lyricsSource(),
    // One band-wide value each (#90): where the band is with it, and 1 to MAX_ENERGY peppers.
    status: songStatus().default("proposed").notNull(),
    energy: smallint(),
    // Archived (#91): out of the repertoire, kept for setlists, gigs and the journal.
    archivedAt: timestamp({ withTimezone: true }),
    // Kept as null when the account is deleted.
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index().on(table.bandId),
    check("songs_energy_range", sql`${table.energy} between 1 and ${sql.raw(String(MAX_ENERGY))}`),
    check(
      "songs_durations_positive",
      sql`${table.standardDuration} >= 0 and ${table.ownDuration} >= 0`,
    ),
  ],
);

/** A song's links (#92): videos, tracks, tutorials. The provider is read from the URL. */
export const songMedia = pgTable(
  "song_media",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid()
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    songId: uuid()
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    url: text().notNull(),
    title: text(),
    // Who it's for ("Drums only"): known codes or free text, cleaned with cleanInstruments.
    instruments: jsonb().$type<Instrument[]>().default([]).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.songId)],
);

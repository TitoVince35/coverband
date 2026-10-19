import type { MusicalKey } from "@coverband/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { bands } from "./band-schema";

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
    check(
      "songs_durations_positive",
      sql`${table.standardDuration} >= 0 and ${table.ownDuration} >= 0`,
    ),
  ],
);

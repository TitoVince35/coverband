import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { bandMembers } from "../bands/schema";

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

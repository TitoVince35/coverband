import {
  INSTRUMENT_LABEL_MAX_LENGTH,
  type Instrument,
  normalizeName,
  parseInstrument,
} from "@coverband/shared";
import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { recordActivity } from "./activity";
import type { Db, Tx } from "./db/client";
import { memberInstruments } from "./db/schema";

/** Instruments one member can list in a band. */
export const MAX_INSTRUMENTS = 10;

/** A free-text instrument is suggested to every band once this many bands use it. */
export const SHARED_SUGGESTION_BANDS = 2;

/**
 * Cleans a list: checks each value (unknown codes become free text, free text matching a known
 * instrument becomes its code), drops duplicates, keeps the order and at most MAX_INSTRUMENTS.
 */
export function cleanInstruments(values: readonly unknown[]): Instrument[] {
  const seen = new Set<string>();
  const list: Instrument[] = [];
  for (const value of values) {
    const instrument = parseInstrument(value);
    if (!instrument) continue;
    const key = "code" in instrument ? instrument.code : `label:${normalizeName(instrument.label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(instrument);
  }
  return list.slice(0, MAX_INSTRUMENTS);
}

const toInstrument = (row: { code: string | null; label: string | null }) =>
  parseInstrument(row.code ? { code: row.code } : { label: row.label }) ?? { label: "" };

/** Instruments of some members of a band, in order, by user id (an empty list for none). */
export async function instrumentsOf(db: Db | Tx, bandId: string, userIds: readonly string[]) {
  const byUser = new Map<string, Instrument[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({
      userId: memberInstruments.userId,
      code: memberInstruments.code,
      label: memberInstruments.label,
    })
    .from(memberInstruments)
    .where(
      and(eq(memberInstruments.bandId, bandId), inArray(memberInstruments.userId, [...userIds])),
    )
    .orderBy(asc(memberInstruments.position));
  for (const row of rows) byUser.get(row.userId)?.push(toInstrument(row));
  return byUser;
}

/** A user's instruments in each of their bands, by band id. */
export async function instrumentsByBand(db: Db, userId: string) {
  const rows = await db
    .select({
      bandId: memberInstruments.bandId,
      code: memberInstruments.code,
      label: memberInstruments.label,
    })
    .from(memberInstruments)
    .where(eq(memberInstruments.userId, userId))
    .orderBy(asc(memberInstruments.position));
  const byBand = new Map<string, Instrument[]>();
  for (const row of rows) {
    byBand.set(row.bandId, [...(byBand.get(row.bandId) ?? []), toInstrument(row)]);
  }
  return byBand;
}

/** Replaces a member's instruments in a band, in the transaction of the change (onboarding). */
export async function writeInstruments(
  tx: Tx,
  member: { bandId: string; userId: string },
  instruments: readonly Instrument[],
) {
  await tx
    .delete(memberInstruments)
    .where(
      and(eq(memberInstruments.bandId, member.bandId), eq(memberInstruments.userId, member.userId)),
    );
  if (instruments.length === 0) return;
  await tx.insert(memberInstruments).values(
    instruments.map((instrument, position) => ({
      ...member,
      position,
      code: "code" in instrument ? instrument.code : null,
      label: "label" in instrument ? instrument.label : null,
    })),
  );
}

/** A member changes their own instruments in a band. Returns the cleaned list. */
export function setInstruments(
  db: Db,
  member: { bandId: string; userId: string },
  values: readonly unknown[],
) {
  const instruments = cleanInstruments(values);
  return db.transaction(async (tx) => {
    await writeInstruments(tx, member, instruments);
    await recordActivity(tx, {
      action: "member.instruments_changed",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "user", id: member.userId },
      // Codes only: free text stays out of the activity, just counted.
      data: {
        codes: instruments.flatMap((i) => ("code" in i ? [i.code] : [])).join(","),
        custom: instruments.filter((i) => "label" in i).length,
      },
    });
    return instruments;
  });
}

/**
 * Free-text instruments used in at least SHARED_SUGGESTION_BANDS bands, most used first, shown
 * as typed most often. One band's typo or private label never reaches the others.
 */
export async function sharedCustomInstruments(db: Db, limit = 100): Promise<string[]> {
  const key = sql`lower(${memberInstruments.label})`;
  const rows = await db
    .select({
      // The most frequent spelling of each label.
      label: sql<string>`mode() within group (order by ${memberInstruments.label})`,
      bands: countDistinct(memberInstruments.bandId),
      uses: count(),
    })
    .from(memberInstruments)
    .where(isNotNull(memberInstruments.label))
    .groupBy(key)
    .having(sql`count(distinct ${memberInstruments.bandId}) >= ${SHARED_SUGGESTION_BANDS}`)
    .orderBy(desc(count()), key)
    .limit(limit);
  return rows
    .map((row) => row.label)
    .filter((label) => label.length <= INSTRUMENT_LABEL_MAX_LENGTH);
}

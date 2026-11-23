import type { BandContactType } from "@coverband/shared";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { contacts, gigContacts, venueContacts, venues } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import type { Member } from "./venues.service";

/** A contact that isn't one of the band's. */
export class UnknownContactError extends AppError {
  constructor() {
    super("bad_request", "Unknown contact");
  }
}

/** A contact's details, as its dialog sends them. */
export type BandContactInput = {
  name: string;
  type: BandContactType;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export const contactColumns = {
  id: contacts.id,
  name: contacts.name,
  type: contacts.type,
  phone: contacts.phone,
  email: contacts.email,
  notes: contacts.notes,
};

export type BandContact = {
  id: string;
  name: string;
  type: BandContactType;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

/** Escapes `%`, `_` and `\` for a LIKE pattern. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A band's contacts by name, with where they're used: the venues they belong to (names) and how
 * many gigs list them; searched by name, phone or email with `q`.
 */
export async function listBandContacts(db: Db, bandId: string, q?: string) {
  const search = q?.trim();
  const rows = await db
    .select(contactColumns)
    .from(contacts)
    .where(
      and(
        eq(contacts.bandId, bandId),
        search
          ? or(
              ilike(contacts.name, likePattern(search)),
              ilike(contacts.phone, likePattern(search)),
              ilike(contacts.email, likePattern(search)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(sql`lower(${contacts.name})`), asc(contacts.id));
  return withUsage(db, bandId, rows);
}

/** Contacts with where they're used: their venues (id, name) and their number of gigs. */
async function withUsage(db: Db | Tx, bandId: string, rows: BandContact[]) {
  const ids = rows.map((row) => row.id);
  const [venueRows, gigRows] = ids.length
    ? await Promise.all([
        db
          .select({ contactId: venueContacts.contactId, id: venues.id, name: venues.name })
          .from(venueContacts)
          .innerJoin(venues, eq(venues.id, venueContacts.venueId))
          .where(and(eq(venueContacts.bandId, bandId), inArray(venueContacts.contactId, ids)))
          .orderBy(asc(venues.name)),
        db
          .select({ contactId: gigContacts.contactId, count: sql<number>`count(*)::int` })
          .from(gigContacts)
          .where(and(eq(gigContacts.bandId, bandId), inArray(gigContacts.contactId, ids)))
          .groupBy(gigContacts.contactId),
      ])
    : [[], []];
  return rows.map((row) => ({
    ...row,
    venues: venueRows
      .filter((venue) => venue.contactId === row.id)
      .map(({ id, name }) => ({ id, name })),
    gigs: gigRows.find((gig) => gig.contactId === row.id)?.count ?? 0,
  }));
}

/** One contact of a band, with where it's used, or null. */
export async function getBandContact(db: Db | Tx, bandId: string, id: string) {
  const rows = await db
    .select(contactColumns)
    .from(contacts)
    .where(and(eq(contacts.bandId, bandId), eq(contacts.id, id)));
  return (await withUsage(db, bandId, rows))[0] ?? null;
}

/** A member adds a contact to the band; `band_contact.created`. */
export function createBandContact(db: Db, member: Member, input: BandContactInput) {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .insert(contacts)
      .values({ ...input, bandId: member.bandId })
      .returning({ id: contacts.id });
    if (!contact) throw new Error("Contact not inserted");
    await recordActivity(tx, {
      action: "band_contact.created",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "band_contact", id: contact.id },
    });
    return getBandContact(tx, member.bandId, contact.id);
  });
}

/**
 * A member changes a contact's details: every gig and venue listing it shows them.
 * `band_contact.updated` when something changed. Null when the band has no such contact.
 */
export function updateBandContact(db: Db, member: Member, id: string, input: BandContactInput) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select(contactColumns)
      .from(contacts)
      .where(and(eq(contacts.bandId, member.bandId), eq(contacts.id, id)))
      .for("update");
    if (!current) return null;
    const changed = (Object.keys(input) as (keyof BandContactInput)[]).some(
      (key) => input[key] !== current[key],
    );
    if (changed) {
      await tx.update(contacts).set(input).where(eq(contacts.id, id));
      await recordActivity(tx, {
        action: "band_contact.updated",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "band_contact", id },
      });
    }
    return getBandContact(tx, member.bandId, id);
  });
}

/** Refuses contacts that aren't the band's. */
async function checkContacts(tx: Tx, bandId: string, ids: readonly string[]) {
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.bandId, bandId), inArray(contacts.id, [...new Set(ids)])));
  if (found.length !== new Set(ids).size) throw new UnknownContactError();
}

/**
 * Sets a gig's own contacts, in order (each once). Returns how many were added: `gig.contact_added`
 * is the caller's.
 */
export async function setGigContacts(
  tx: Tx,
  bandId: string,
  gigId: string,
  ids: readonly string[],
) {
  const unique = [...new Set(ids)];
  await checkContacts(tx, bandId, unique);
  const before = await tx
    .select({ contactId: gigContacts.contactId })
    .from(gigContacts)
    .where(eq(gigContacts.gigId, gigId));
  await tx.delete(gigContacts).where(eq(gigContacts.gigId, gigId));
  if (unique.length > 0) {
    await tx
      .insert(gigContacts)
      .values(unique.map((contactId, position) => ({ gigId, contactId, bandId, position })));
  }
  return unique.filter((id) => !before.some((row) => row.contactId === id)).length;
}

/** Sets a venue's contacts, in order (each once). Returns whether they changed. */
export async function setVenueContacts(
  tx: Tx,
  bandId: string,
  venueId: string,
  ids: readonly string[],
) {
  const unique = [...new Set(ids)];
  await checkContacts(tx, bandId, unique);
  const before = await tx
    .select({ contactId: venueContacts.contactId })
    .from(venueContacts)
    .where(eq(venueContacts.venueId, venueId))
    .orderBy(asc(venueContacts.position));
  if (before.map((row) => row.contactId).join() === unique.join()) return false;
  await tx.delete(venueContacts).where(eq(venueContacts.venueId, venueId));
  if (unique.length > 0) {
    await tx
      .insert(venueContacts)
      .values(unique.map((contactId, position) => ({ venueId, contactId, bandId, position })));
  }
  return true;
}

/** The own contacts of gigs, in order, by gig id. */
export async function contactsOfGigs(db: Db | Tx, bandId: string, gigIds: readonly string[]) {
  const rows = gigIds.length
    ? await db
        .select({ ...contactColumns, gigId: gigContacts.gigId })
        .from(gigContacts)
        .innerJoin(contacts, eq(contacts.id, gigContacts.contactId))
        .where(and(eq(gigContacts.bandId, bandId), inArray(gigContacts.gigId, [...gigIds])))
        .orderBy(asc(gigContacts.position))
    : [];
  return group(rows, (row) => row.gigId);
}

/** The contacts of venues, in order, by venue id. */
export async function contactsOfVenues(db: Db | Tx, bandId: string, venueIds: readonly string[]) {
  const rows = venueIds.length
    ? await db
        .select({ ...contactColumns, venueId: venueContacts.venueId })
        .from(venueContacts)
        .innerJoin(contacts, eq(contacts.id, venueContacts.contactId))
        .where(and(eq(venueContacts.bandId, bandId), inArray(venueContacts.venueId, [...venueIds])))
        .orderBy(asc(venueContacts.position))
    : [];
  return group(rows, (row) => row.venueId);
}

/** Rows by key, each without the key's column. */
function group<T extends BandContact>(rows: T[], keyOf: (row: T) => string) {
  const map = new Map<string, BandContact[]>();
  for (const row of rows) {
    const { id, name, type, phone, email, notes } = row;
    const list = map.get(keyOf(row)) ?? [];
    list.push({ id, name, type, phone, email, notes });
    map.set(keyOf(row), list);
  }
  return map;
}

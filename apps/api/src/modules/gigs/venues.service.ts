import type { WebLink } from "@coverband/shared";
import { and, asc, count, eq, ilike, max, or, sql } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { isUniqueViolation } from "../../core/db/pg-errors";
import { gigs, venues } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { contactsOfVenues, setVenueContacts } from "./contacts.service";

/** The band already has a venue with this name in this city, whatever their case. */
export class VenueTakenError extends AppError {
  constructor() {
    super("venue_taken", "The band already has a venue with this name in this city");
  }
}

/** A venue that isn't one of the band's. */
export class UnknownVenueError extends AppError {
  constructor() {
    super("bad_request", "Unknown venue");
  }
}

export type Member = { bandId: string; userId: string };

/** A venue's details, as a form sends them. */
export type VenueInput = {
  name: string;
  city: string;
  address: string | null;
  links: WebLink[];
  description: string | null;
  /** Its usual people (#329), in order; absent, unchanged. */
  contactIds?: string[] | undefined;
};

export const venueColumns = {
  id: venues.id,
  name: venues.name,
  city: venues.city,
  address: venues.address,
  links: venues.links,
  description: venues.description,
};

/** A name and city taken by another venue of the band becomes VenueTakenError. */
export async function venueChecked<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    throw isUniqueViolation(error, "venues_band_name_city_lower_unique")
      ? new VenueTakenError()
      : error;
  }
}

/** Escapes `%`, `_` and `\` for a LIKE pattern. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A band's venues, by name, with how many gigs use each, the date of the latest and their
 * contacts; searched by name or city with `q`.
 */
export async function listVenues(db: Db, bandId: string, q?: string) {
  const search = q?.trim();
  const rows = await db
    .select({
      ...venueColumns,
      gigs: count(gigs.id),
      lastGig: max(gigs.date),
    })
    .from(venues)
    .leftJoin(gigs, eq(gigs.venueId, venues.id))
    .where(
      and(
        eq(venues.bandId, bandId),
        search
          ? or(ilike(venues.name, likePattern(search)), ilike(venues.city, likePattern(search)))
          : undefined,
      ),
    )
    .groupBy(venues.id)
    .orderBy(asc(sql`lower(${venues.name})`), asc(venues.city), asc(venues.id));
  // With their contacts (#329): the gig form shows them as soon as a venue is chosen.
  const contacts = await contactsOfVenues(
    db,
    bandId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, contacts: contacts.get(row.id) ?? [] }));
}

/** One venue of a band, with how many gigs use it and its contacts (#329), or null. */
export async function getVenue(db: Db | Tx, bandId: string, id: string) {
  const [venue] = await db
    .select({ ...venueColumns, gigs: count(gigs.id), lastGig: max(gigs.date) })
    .from(venues)
    .leftJoin(gigs, eq(gigs.venueId, venues.id))
    .where(and(eq(venues.bandId, bandId), eq(venues.id, id)))
    .groupBy(venues.id);
  if (!venue) return null;
  const contacts = (await contactsOfVenues(db, bandId, [id])).get(id) ?? [];
  return { ...venue, contacts };
}

const sameLinks = (a: readonly WebLink[], b: readonly WebLink[]) =>
  a.length === b.length &&
  a.every((link, i) => link.url === b[i]?.url && link.title === b[i]?.title);

/**
 * Changes a venue of the band (every gig there shows it): records `venue.updated` when something
 * changed. Null when the band has no such venue. Run inside `venueChecked`.
 */
export async function writeVenue(
  tx: Tx,
  member: Member,
  id: string,
  { contactIds, ...input }: VenueInput,
) {
  const [current] = await tx
    .select(venueColumns)
    .from(venues)
    .where(and(eq(venues.bandId, member.bandId), eq(venues.id, id)))
    .for("update");
  if (!current) return null;
  const contactsChanged =
    contactIds !== undefined && (await setVenueContacts(tx, member.bandId, id, contactIds));
  const changed =
    contactsChanged ||
    current.name !== input.name ||
    current.city !== input.city ||
    current.address !== input.address ||
    current.description !== input.description ||
    !sameLinks(current.links, input.links);
  if (changed) {
    await tx.update(venues).set(input).where(eq(venues.id, id));
    await recordActivity(tx, {
      action: "venue.updated",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "venue", id },
    });
  }
  return id;
}

/** Adds a venue to the band; records `venue.created`. Run inside `venueChecked`. */
export async function insertVenue(tx: Tx, member: Member, { contactIds, ...input }: VenueInput) {
  const [venue] = await tx
    .insert(venues)
    .values({ ...input, bandId: member.bandId })
    .returning({ id: venues.id });
  if (!venue) throw new Error("Venue not inserted");
  if (contactIds?.length) await setVenueContacts(tx, member.bandId, venue.id, contactIds);
  await recordActivity(tx, {
    action: "venue.created",
    bandId: member.bandId,
    actorId: member.userId,
    target: { type: "venue", id: venue.id },
  });
  return venue.id;
}

/** A member changes a venue's details. Returns it, or null when there's none. */
export function updateVenue(db: Db, member: Member, id: string, input: VenueInput) {
  return venueChecked(() =>
    db.transaction(async (tx) => {
      const found = await writeVenue(tx, member, id, input);
      return found ? getVenue(tx, member.bandId, id) : null;
    }),
  );
}

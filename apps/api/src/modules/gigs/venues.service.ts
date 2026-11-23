import type { WebLink } from "@coverband/shared";
import { and, asc, count, eq, ilike, max, or, sql } from "drizzle-orm";
import type { Coordinates, Geocoder } from "../../adapters/geocoder";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { isUniqueViolation } from "../../core/db/pg-errors";
import { gigs, venues } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import type { Logger } from "../../core/log";
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
  /** Its pin dragged on the map (#333); absent: found from the address once saved. */
  coordinates?: Coordinates | undefined;
};

/** What Nominatim is asked for a venue (#333): its address and city; null without an address. */
export const geocodeQuery = (venue: { address: string | null; city: string }) =>
  venue.address ? `${venue.address}, ${venue.city}` : null;

/** A dragged pin, as stored: kept for the venue's address, which won't be looked up again. */
const pinned = (input: { address: string | null; city: string }, coordinates?: Coordinates) =>
  coordinates ? { ...coordinates, geocodedQuery: geocodeQuery(input) } : {};

export const venueColumns = {
  id: venues.id,
  name: venues.name,
  city: venues.city,
  address: venues.address,
  links: venues.links,
  description: venues.description,
  latitude: venues.latitude,
  longitude: venues.longitude,
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
  { contactIds, coordinates, ...input }: VenueInput,
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
    (coordinates !== undefined &&
      (coordinates.latitude !== current.latitude || coordinates.longitude !== current.longitude)) ||
    current.name !== input.name ||
    current.city !== input.city ||
    current.address !== input.address ||
    current.description !== input.description ||
    !sameLinks(current.links, input.links);
  if (changed) {
    await tx
      .update(venues)
      .set({ ...input, ...pinned(input, coordinates) })
      .where(eq(venues.id, id));
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
export async function insertVenue(
  tx: Tx,
  member: Member,
  { contactIds, coordinates, ...input }: VenueInput,
) {
  const [venue] = await tx
    .insert(venues)
    .values({ ...input, ...pinned(input, coordinates), bandId: member.bandId })
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
/**
 * Places a saved venue on the map (#333), after its transaction (never inside: Nominatim may take
 * a second): once per address, the answer kept with the venue (not found: no coordinates, until
 * the address changes). A venue without an address has no map. Nominatim failing is logged as an
 * error (#208) and leaves the venue as it was: the next save asks again. Returns whether its
 * coordinates changed.
 */
export async function locateVenue(
  { db, geocoder, log }: { db: Db; geocoder: Geocoder; log: Logger },
  bandId: string,
  venueId: string,
) {
  const [venue] = await db
    .select({ address: venues.address, city: venues.city, geocodedQuery: venues.geocodedQuery })
    .from(venues)
    .where(and(eq(venues.bandId, bandId), eq(venues.id, venueId)));
  if (!venue) return false;
  const query = geocodeQuery(venue);
  if (query === venue.geocodedQuery) return false;
  let found: Coordinates | null = null;
  if (query) {
    try {
      found = await geocoder.locate(query);
    } catch (error) {
      log.error("Nominatim failed", { venueId, err: error });
      return false;
    }
  }
  // Only if the venue's address is still the one looked up.
  const rows = await db
    .update(venues)
    .set({
      latitude: found?.latitude ?? null,
      longitude: found?.longitude ?? null,
      geocodedQuery: query,
    })
    .where(
      and(
        eq(venues.id, venueId),
        venue.address === null ? sql`${venues.address} is null` : eq(venues.address, venue.address),
        eq(venues.city, venue.city),
      ),
    )
    .returning({ id: venues.id });
  return rows.length > 0;
}

export function updateVenue(db: Db, member: Member, id: string, input: VenueInput) {
  return venueChecked(() =>
    db.transaction(async (tx) => {
      const found = await writeVenue(tx, member, id, input);
      return found ? getVenue(tx, member.bandId, id) : null;
    }),
  );
}

import { firstCurrentGigDate, type GigFilter, type GigType } from "@coverband/shared";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { gigs, users, venues } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import {
  insertVenue,
  type Member,
  UnknownVenueError,
  type VenueInput,
  venueChecked,
  writeVenue,
} from "./venues.service";

export type { Member } from "./venues.service";

/** Someone saved the gig since it was read: reload it, then change it again. */
export class GigOutdatedError extends AppError {
  constructor() {
    super("gig_outdated", "The gig changed since it was read: reload it");
  }
}

/** A gig's main details, as its form sends them. */
export type GigInput = {
  date: string;
  title: string | null;
  type: GigType;
  showTime: string | null;
  /** The band's venue (`id`, its details as edited), a new one (no `id`), or none. */
  venue: (VenueInput & { id?: string | undefined }) | null;
};

const gigColumns = {
  id: gigs.id,
  date: gigs.date,
  title: gigs.title,
  type: gigs.type,
  showTime: gigs.showTime,
  status: gigs.status,
  version: gigs.version,
  createdById: gigs.createdById,
  createdAt: gigs.createdAt,
  updatedAt: gigs.updatedAt,
  // Who created it: their current display name, null once their account is deleted.
  createdBy: users.name,
  venueId: venues.id,
  venueName: venues.name,
  venueCity: venues.city,
  venueAddress: venues.address,
  venueLinks: venues.links,
  venueDescription: venues.description,
};

type GigRow = Awaited<ReturnType<typeof selectGigs>>[number];

/** A row as the API sends it: the venue as an object (null without one). */
function shaped({
  venueId,
  venueName,
  venueCity,
  venueAddress,
  venueLinks,
  venueDescription,
  ...gig
}: GigRow) {
  return {
    ...gig,
    venue:
      venueId && venueName !== null && venueCity !== null
        ? {
            id: venueId,
            name: venueName,
            city: venueCity,
            address: venueAddress,
            links: venueLinks ?? [],
            description: venueDescription,
          }
        : null,
  };
}

export type Gig = ReturnType<typeof shaped>;

const selectGigs = (db: Db | Tx) =>
  db
    .select(gigColumns)
    .from(gigs)
    .leftJoin(venues, eq(venues.id, gigs.venueId))
    .leftJoin(users, eq(users.id, gigs.createdById));

/**
 * A band's gigs (brief 034) by "A gig's day" at `now` in the member's time zone: next (today's
 * and upcoming ones, the soonest first), past (the latest first), or all (in date order).
 */
export async function listGigs(
  db: Db,
  bandId: string,
  filter: GigFilter,
  { now, timeZone }: { now: Date; timeZone: string },
) {
  const first = firstCurrentGigDate(now, timeZone);
  const rows = await selectGigs(db)
    .where(
      and(
        eq(gigs.bandId, bandId),
        filter === "next"
          ? gte(gigs.date, first)
          : filter === "past"
            ? lt(gigs.date, first)
            : undefined,
      ),
    )
    .orderBy(
      filter === "past" ? desc(gigs.date) : asc(gigs.date),
      filter === "past" ? desc(gigs.showTime) : asc(gigs.showTime),
      asc(gigs.createdAt),
      asc(gigs.id),
    );
  return rows.map(shaped);
}

/** One gig of a band, or null. */
export async function getGig(db: Db | Tx, bandId: string, id: string) {
  const [row] = await selectGigs(db).where(and(eq(gigs.bandId, bandId), eq(gigs.id, id)));
  return row ? shaped(row) : null;
}

/** The gig's venue: the band's (its details saved as edited), a new one, or none. */
async function venueOf(tx: Tx, member: Member, venue: GigInput["venue"]) {
  if (!venue) return null;
  const { id, ...details } = venue;
  if (!id) return insertVenue(tx, member, details);
  const found = await writeVenue(tx, member, id, details);
  if (!found) throw new UnknownVenueError();
  return found;
}

/** A member creates a gig, proposed, with its venue (a new one saved along); `gig.created`. */
export function createGig(db: Db, member: Member, input: GigInput) {
  return venueChecked(() =>
    db.transaction(async (tx) => {
      const venueId = await venueOf(tx, member, input.venue);
      const [gig] = await tx
        .insert(gigs)
        .values({
          bandId: member.bandId,
          date: input.date,
          title: input.title,
          type: input.type,
          showTime: input.showTime,
          venueId,
          createdById: member.userId,
        })
        .returning({ id: gigs.id });
      if (!gig) throw new Error("Gig not inserted");
      await recordActivity(tx, {
        action: "gig.created",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "gig", id: gig.id },
      });
      return getGig(tx, member.bandId, gig.id);
    }),
  );
}

/** Locks one gig of the band for a change; null when the band has none with this id. */
export async function lockGig(tx: Tx, bandId: string, id: string) {
  const [gig] = await tx
    .select({
      date: gigs.date,
      title: gigs.title,
      type: gigs.type,
      showTime: gigs.showTime,
      status: gigs.status,
      venueId: gigs.venueId,
      version: gigs.version,
      createdById: gigs.createdById,
    })
    .from(gigs)
    .where(and(eq(gigs.bandId, bandId), eq(gigs.id, id)))
    .for("update");
  return gig ?? null;
}

/**
 * A member changes a gig's main details, read at `version` (GigOutdatedError when someone saved
 * since); its venue's details change for every gig there. Raises the version; `gig.updated` with
 * the changed fields. Null when the band has no such gig.
 */
export function updateGig(
  db: Db,
  member: Member,
  id: string,
  { version, ...input }: GigInput & { version: number },
) {
  return venueChecked(() =>
    db.transaction(async (tx) => {
      const current = await lockGig(tx, member.bandId, id);
      if (!current) return null;
      if (current.version !== version) throw new GigOutdatedError();
      const venueId = await venueOf(tx, member, input.venue);
      const next = {
        date: input.date,
        title: input.title,
        type: input.type,
        showTime: input.showTime,
        venueId,
      };
      const fields = (Object.keys(next) as (keyof typeof next)[]).filter(
        (key) => next[key] !== current[key],
      );
      await tx
        .update(gigs)
        .set({ ...next, version: sql`${gigs.version} + 1` })
        .where(eq(gigs.id, id));
      if (fields.length > 0) {
        await recordActivity(tx, {
          action: "gig.updated",
          bandId: member.bandId,
          actorId: member.userId,
          target: { type: "gig", id },
          data: { fields: fields.join(",") },
        });
      }
      return getGig(tx, member.bandId, id);
    }),
  );
}

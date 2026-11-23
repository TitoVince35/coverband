import {
  firstCurrentGigDate,
  type GigFilter,
  type GigStatus,
  type GigType,
  gigDay,
  type WebLink,
} from "@coverband/shared";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { gigs, users, venues } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import type { AppDeps } from "../../deps";
import { getSetlist } from "../setlists/service";
import { contactsOfGigs, contactsOfVenues, setGigContacts } from "./contacts.service";
import { deletePosterFiles, gigPosterKeys, postersOfGigs } from "./posters.service";

export { bandPosterKeys } from "./posters.service";

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

/** A setlist that isn't one of the band's current ones. */
export class UnknownSetlistError extends AppError {
  constructor() {
    super("bad_request", "Unknown setlist");
  }
}

/** A cancelled gig is read-only (it can still be deleted). */
export class GigCancelledError extends AppError {
  constructor() {
    super("gig_cancelled", "This gig is cancelled: it can't be changed");
  }
}

/** A gig whose day is over is read-only (it can still be deleted). */
export class GigPastError extends AppError {
  constructor() {
    super("gig_past", "This gig is over: it can't be changed");
  }
}

/** A settled gig keeps its date, title and venue (postpone it first), and is cancelled before deleting. */
export class GigSettledError extends AppError {
  constructor(message = "This gig is settled: postpone it to change its date, title or venue") {
    super("gig_settled", message);
  }
}

/** Settle, postpone, cancel and delete: the gig's creator or a band leader. */
export class GigForbiddenError extends AppError {
  constructor() {
    super("forbidden", "Only the gig's creator or a band leader can do this");
  }
}

/** The moment and time zone that decide "A gig's day" for a request. */
export type When = { now: Date; timeZone: string };

/** A member and their rights on the band's gigs. */
export type GigMember = Member & { isLeader: boolean };

/** Whether this member settles, postpones, cancels and deletes the gig: its creator or a band leader. */
export const canManageGig = (gig: { createdById: string | null }, member: GigMember) =>
  member.isLeader || gig.createdById === member.userId;

/** Refuses a change to a cancelled gig, or to one whose day is over. */
function checkEditable(gig: { status: GigStatus; date: string }, when: When) {
  if (gig.status === "cancelled") throw new GigCancelledError();
  if (gigDay(gig.date, when.now, when.timeZone) === "past") throw new GigPastError();
}

/** A gig's main details, as its form sends them. */
export type GigInput = {
  date: string;
  title: string | null;
  type: GigType;
  showTime: string | null;
  /** The band's venue (`id`, its details as edited), a new one (no `id`), or none. */
  venue: (VenueInput & { id?: string | undefined }) | null;
} & GigExtras;

/** A gig's setlist, program and extra info (#328), as its form sends them. */
export type GigExtras = {
  setlistId: string | null;
  getInTime: string | null;
  programLinks: WebLink[];
  programNotes: string | null;
  payCents: number | null;
  payNotes: string | null;
  sharedBackline: boolean;
  backlineNotes: string | null;
  techniciansProvided: boolean;
  notes: string | null;
  /** Its own contacts (#329), in order; absent, unchanged. */
  contactIds?: string[] | undefined;
};

const extraColumns = {
  setlistId: gigs.setlistId,
  getInTime: gigs.getInTime,
  programLinks: gigs.programLinks,
  programNotes: gigs.programNotes,
  payCents: gigs.payCents,
  payNotes: gigs.payNotes,
  sharedBackline: gigs.sharedBackline,
  backlineNotes: gigs.backlineNotes,
  techniciansProvided: gigs.techniciansProvided,
  notes: gigs.notes,
};

/** The extras of a form's input, as stored. */
const extrasOf = (input: GigExtras): Omit<GigExtras, "contactIds"> => ({
  setlistId: input.setlistId,
  getInTime: input.getInTime,
  programLinks: input.programLinks,
  programNotes: input.programNotes,
  payCents: input.payCents,
  payNotes: input.payNotes,
  sharedBackline: input.sharedBackline,
  backlineNotes: input.backlineNotes,
  techniciansProvided: input.techniciansProvided,
  notes: input.notes,
});

/**
 * Refuses a setlist newly chosen for a gig that isn't one of the band's current setlists (an
 * archived one stays linked, but isn't chosen anew).
 */
async function checkSetlist(
  tx: Tx,
  bandId: string,
  setlistId: string | null,
  current?: string | null,
) {
  if (!setlistId || setlistId === current) return;
  const setlist = await getSetlist(tx, bandId, setlistId);
  if (!setlist || setlist.archivedAt) throw new UnknownSetlistError();
}

const cancellers = alias(users, "cancellers");

const gigColumns = {
  id: gigs.id,
  date: gigs.date,
  title: gigs.title,
  type: gigs.type,
  showTime: gigs.showTime,
  status: gigs.status,
  ...extraColumns,
  version: gigs.version,
  createdById: gigs.createdById,
  createdAt: gigs.createdAt,
  updatedAt: gigs.updatedAt,
  // Who created it: their current display name, null once their account is deleted.
  createdBy: users.name,
  cancelledReason: gigs.cancelledReason,
  cancelledAt: gigs.cancelledAt,
  // Who cancelled it, null once their account is deleted.
  cancelledBy: cancellers.name,
  venueId: venues.id,
  venueName: venues.name,
  venueCity: venues.city,
  venueAddress: venues.address,
  venueLinks: venues.links,
  venueDescription: venues.description,
  venueLatitude: venues.latitude,
  venueLongitude: venues.longitude,
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
  venueLatitude,
  venueLongitude,
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
            latitude: venueLatitude,
            longitude: venueLongitude,
          }
        : null,
  };
}

/**
 * Gigs with their contacts (#329): the venue's (`venue.contacts`), shown first, and their own
 * (`contacts`): linked, never copied.
 */
async function withContacts(db: Db | Tx, bandId: string, rows: ReturnType<typeof shaped>[]) {
  const own = await contactsOfGigs(
    db,
    bandId,
    rows.map((gig) => gig.id),
  );
  const ofVenues = await contactsOfVenues(
    db,
    bandId,
    rows.flatMap((gig) => (gig.venue ? [gig.venue.id] : [])),
  );
  // Its posters (#330), oldest first: the web app builds their files' URLs (`posterUrl`).
  const posters = await postersOfGigs(
    db,
    bandId,
    rows.map((gig) => gig.id),
  );
  return rows.map((gig) => ({
    ...gig,
    contacts: own.get(gig.id) ?? [],
    posters: posters.get(gig.id) ?? [],
    venue: gig.venue ? { ...gig.venue, contacts: ofVenues.get(gig.venue.id) ?? [] } : null,
  }));
}

export type Gig = Awaited<ReturnType<typeof withContacts>>[number];

const selectGigs = (db: Db | Tx) =>
  db
    .select(gigColumns)
    .from(gigs)
    .leftJoin(venues, eq(venues.id, gigs.venueId))
    .leftJoin(users, eq(users.id, gigs.createdById))
    .leftJoin(cancellers, eq(cancellers.id, gigs.cancelledById));

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
  return withContacts(db, bandId, rows.map(shaped));
}

/** One gig of a band, or null. */
export async function getGig(db: Db | Tx, bandId: string, id: string) {
  const [row] = await selectGigs(db).where(and(eq(gigs.bandId, bandId), eq(gigs.id, id)));
  return row ? ((await withContacts(db, bandId, [shaped(row)]))[0] ?? null) : null;
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
      await checkSetlist(tx, member.bandId, input.setlistId);
      const [gig] = await tx
        .insert(gigs)
        .values({
          bandId: member.bandId,
          date: input.date,
          title: input.title,
          type: input.type,
          showTime: input.showTime,
          venueId,
          ...extrasOf(input),
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
      if (input.contactIds?.length) {
        await setGigContacts(tx, member.bandId, gig.id, input.contactIds);
        await recordActivity(tx, {
          action: "gig.contact_added",
          bandId: member.bandId,
          actorId: member.userId,
          target: { type: "gig", id: gig.id },
          data: { count: new Set(input.contactIds).size },
        });
      }
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
      ...extraColumns,
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
 * since); its venue's details change for every gig there. Refused on a cancelled or past gig; a
 * settled one keeps its date, title and venue. Raises the version; `gig.updated` with the changed
 * fields. Null when the band has no such gig.
 */
export function updateGig(
  db: Db,
  member: Member,
  id: string,
  { version, ...input }: GigInput & { version: number },
  when: When,
) {
  return venueChecked(() =>
    db.transaction(async (tx) => {
      const current = await lockGig(tx, member.bandId, id);
      if (!current) return null;
      checkEditable(current, when);
      if (current.version !== version) throw new GigOutdatedError();
      if (
        current.status === "settled" &&
        (input.date !== current.date ||
          input.title !== current.title ||
          (input.venue?.id ?? null) !== current.venueId)
      ) {
        throw new GigSettledError();
      }
      const venueId = await venueOf(tx, member, input.venue);
      await checkSetlist(tx, member.bandId, input.setlistId, current.setlistId);
      const next = {
        date: input.date,
        title: input.title,
        type: input.type,
        showTime: input.showTime,
        venueId,
        ...extrasOf(input),
      };
      const fields = (Object.keys(next) as (keyof typeof next)[]).filter((key) =>
        key === "programLinks"
          ? JSON.stringify(next.programLinks) !== JSON.stringify(current.programLinks)
          : next[key] !== current[key],
      );
      await tx
        .update(gigs)
        .set({ ...next, version: sql`${gigs.version} + 1` })
        .where(eq(gigs.id, id));
      const event = (
        action:
          | "gig.updated"
          | "gig.program_link_added"
          | "gig.program_updated"
          | "gig.contact_added",
        data?: Record<string, string | number>,
      ) =>
        recordActivity(tx, {
          action,
          bandId: member.bandId,
          actorId: member.userId,
          target: { type: "gig", id },
          ...(data ? { data } : {}),
        });
      // The program's own events (#328): a link added, its text changed.
      const added = next.programLinks.filter(
        (link) => !current.programLinks.some((old) => old.url === link.url),
      ).length;
      if (added > 0) await event("gig.program_link_added", { count: added });
      if (next.programNotes !== current.programNotes) await event("gig.program_updated");
      if (input.contactIds !== undefined) {
        const contactsAdded = await setGigContacts(tx, member.bandId, id, input.contactIds);
        if (contactsAdded > 0) await event("gig.contact_added", { count: contactsAdded });
      }
      const others = fields.filter((field) => field !== "programLinks" && field !== "programNotes");
      if (others.length > 0) await event("gig.updated", { fields: others.join(",") });
      return getGig(tx, member.bandId, id);
    }),
  );
}

/**
 * Locks a gig whose content may still change (its posters, #330): false when the band has no
 * such gig; refused when it's cancelled or past.
 */
export async function lockEditableGig(tx: Tx, bandId: string, id: string, when: When) {
  const current = await lockGig(tx, bandId, id);
  if (!current) return false;
  checkEditable(current, when);
  return true;
}

/** Locks a gig for a status change by its creator or a band leader; null when there's none. */
async function lockForManager(tx: Tx, member: GigMember, id: string) {
  const current = await lockGig(tx, member.bandId, id);
  if (!current) return null;
  if (!canManageGig(current, member)) throw new GigForbiddenError();
  return current;
}

/** Sets a gig's status, raises its version and records the event; returns the gig. */
async function writeStatus(
  tx: Tx,
  member: Member,
  id: string,
  action: "gig.settled" | "gig.postponed" | "gig.cancelled",
  changes: Partial<typeof gigs.$inferInsert>,
) {
  await tx
    .update(gigs)
    .set({ ...changes, version: sql`${gigs.version} + 1` })
    .where(eq(gigs.id, id));
  await recordActivity(tx, {
    action,
    bandId: member.bandId,
    actorId: member.userId,
    target: { type: "gig", id },
  });
  return getGig(tx, member.bandId, id);
}

/**
 * Its creator or a band leader settles a proposed gig (#327): its date, title and venue are then
 * fixed. `changed` says whether it was proposed (a settled one stays as it is). Null when the band
 * has no such gig.
 */
export function settleGig(db: Db, member: GigMember, id: string, when: When) {
  return db.transaction(async (tx) => {
    const current = await lockForManager(tx, member, id);
    if (!current) return null;
    checkEditable(current, when);
    if (current.status === "settled") {
      return { gig: await getGig(tx, member.bandId, id), changed: false };
    }
    return {
      gig: await writeStatus(tx, member, id, "gig.settled", { status: "settled" }),
      changed: true,
    };
  });
}

/** Its creator or a band leader brings a settled gig back to proposed, to change its date (#327). */
export function postponeGig(db: Db, member: GigMember, id: string, when: When) {
  return db.transaction(async (tx) => {
    const current = await lockForManager(tx, member, id);
    if (!current) return null;
    checkEditable(current, when);
    if (current.status === "proposed") return getGig(tx, member.bandId, id);
    return writeStatus(tx, member, id, "gig.postponed", { status: "proposed" });
  });
}

/**
 * Its creator or a band leader cancels a gig (#327), with the reason; who and when are kept. It
 * is read-only afterwards.
 */
export function cancelGig(db: Db, member: GigMember, id: string, reason: string, when: When) {
  return db.transaction(async (tx) => {
    const current = await lockForManager(tx, member, id);
    if (!current) return null;
    checkEditable(current, when);
    return writeStatus(tx, member, id, "gig.cancelled", {
      status: "cancelled",
      cancelledReason: reason,
      cancelledById: member.userId,
      cancelledAt: new Date(),
    });
  });
}

/**
 * Its creator or a band leader deletes a gig (#327): a proposed or cancelled one, or a past one
 * whatever its status (a mistake can be removed); a settled one is cancelled first. Its venue
 * stays in the band's list; its posters' files go once it's gone. False when the band has no
 * such gig.
 */
export async function deleteGig(
  deps: Pick<AppDeps, "db" | "storage" | "log">,
  member: GigMember,
  id: string,
  when: When,
) {
  const keys = await deps.db.transaction(async (tx) => {
    const current = await lockForManager(tx, member, id);
    if (!current) return null;
    const past = gigDay(current.date, when.now, when.timeZone) === "past";
    if (current.status === "settled" && !past) {
      throw new GigSettledError("This gig is settled: cancel it before deleting it");
    }
    const posterKeys = await gigPosterKeys(tx, id);
    await tx.delete(gigs).where(eq(gigs.id, id));
    await recordActivity(tx, {
      action: "gig.deleted",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "gig", id },
    });
    return posterKeys;
  });
  if (!keys) return false;
  await deletePosterFiles(deps, keys);
  return true;
}

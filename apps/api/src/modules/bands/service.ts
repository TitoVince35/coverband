import { type BandLogo, type BandRole, type Instrument, slugify } from "@coverband/shared";
import { and, asc, count, desc, eq, gte, ilike, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { isUniqueViolation } from "../../core/db/pg-errors";
import { bandMembers, bands, users } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { instrumentsByBand, writeInstruments } from "../instruments/service";
import { logoOf } from "./logo";

export type Band = typeof bands.$inferSelect;

/** A user's bands by name, with their role and their instruments in each. */
export async function bandsOf(db: Db, userId: string) {
  const rows = await db
    .select({
      name: bands.name,
      slug: bands.slug,
      genre: bands.genre,
      role: bandMembers.role,
      bandId: bands.id,
      logoKey: bands.logoKey,
      logoThumbnailKey: bands.logoThumbnailKey,
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bands.id, bandMembers.bandId))
    .where(eq(bandMembers.userId, userId))
    .orderBy(asc(bands.name));
  const instruments = await instrumentsByBand(db, userId);
  return rows.map(({ bandId, logoKey, logoThumbnailKey, ...band }) => ({
    ...band,
    logo: logoOf({ id: bandId, slug: band.slug, logoKey, logoThumbnailKey }),
    instruments: instruments.get(bandId) ?? [],
  }));
}

/** The band of this slug and the user's role in it; null when they aren't a member (or no band). */
export async function membershipOf(
  db: Db,
  slug: string,
  userId: string,
): Promise<{ band: Band; role: BandRole } | null> {
  const [row] = await db
    .select({ band: bands, role: bandMembers.role })
    .from(bands)
    .innerJoin(bandMembers, and(eq(bandMembers.bandId, bands.id), eq(bandMembers.userId, userId)))
    .where(eq(bands.slug, slug));
  return row ?? null;
}

/** Whether two users are members of a same band. */
export async function shareABand(db: Db, userId: string, otherId: string) {
  const theirs = alias(bandMembers, "theirs");
  const [shared] = await db
    .select({ bandId: bandMembers.bandId })
    .from(bandMembers)
    .innerJoin(theirs, and(eq(theirs.bandId, bandMembers.bandId), eq(theirs.userId, otherId)))
    .where(eq(bandMembers.userId, userId))
    .limit(1);
  return shared !== undefined;
}

export class BandNameTakenError extends AppError {
  constructor() {
    super("band_name_taken", "Band name already taken");
  }
}

/** Band names are unique regardless of case. */
export async function isBandNameAvailable(db: Db | Tx, name: string) {
  const [taken] = await db
    .select({ id: bands.id })
    .from(bands)
    .where(eq(sql`lower(${bands.name})`, name.trim().toLowerCase()));
  return taken === undefined;
}

/** The slug itself if free, else slug-2, slug-3... (two names can give the same slug). */
async function freeSlug(tx: Tx, base: string): Promise<string> {
  const rows = await tx
    .select({ slug: bands.slug })
    .from(bands)
    .where(sql`${bands.slug} = ${base} or ${bands.slug} like ${`${base}-%`}`);
  const used = new Set(rows.map((row) => row.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

/** A band leader creates their band (its leader membership is added by addMember). */
export async function createBand(
  tx: Tx,
  input: { name: string; genre?: string | undefined },
  actorId: string,
): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  if (!(await isBandNameAvailable(tx, name))) throw new BandNameTakenError();
  let band: { id: string; slug: string } | undefined;
  try {
    [band] = await tx
      .insert(bands)
      .values({ name, slug: await freeSlug(tx, slugify(name)), genre: input.genre?.trim() || null })
      .returning({ id: bands.id, slug: bands.slug });
  } catch (error) {
    // Two people choosing the same name at the same moment: the unique index decides.
    throw isUniqueViolation(error, "bands_name_lower_unique") ? new BandNameTakenError() : error;
  }
  if (!band) throw new Error("Band insert returned nothing");
  await recordActivity(tx, {
    action: "band.created",
    bandId: band.id,
    actorId,
    target: { type: "band", id: band.id },
  });
  return band;
}

/** A band's name and slug, or null when there's none. */
export async function bandOf(db: Db | Tx, id: string) {
  const [band] = await db
    .select({ name: bands.name, slug: bands.slug })
    .from(bands)
    .where(eq(bands.id, id));
  return band ?? null;
}

/** Whether the band has a member with this email. */
export async function hasMemberWithEmail(db: Db | Tx, bandId: string, email: string) {
  const [member] = await db
    .select({ userId: bandMembers.userId })
    .from(bandMembers)
    .innerJoin(users, eq(users.id, bandMembers.userId))
    .where(and(eq(bandMembers.bandId, bandId), eq(users.email, email)));
  return member !== undefined;
}

/** How many bands there are, and how many were created since `since` (the admin console). */
export async function countBands(db: Db, since: Date) {
  const [row] = await db
    .select({
      total: count(),
      since: count(sql`case when ${gte(bands.createdAt, since)} then 1 end`),
    })
    .from(bands);
  return { total: row?.total ?? 0, since: row?.since ?? 0 };
}

/** How the admin console sorts bands (#247). */
export const ADMIN_BAND_SORTS = ["name", "createdAt", "members"] as const;
export type AdminBandSort = (typeof ADMIN_BAND_SORTS)[number];

/** A page of the admin console's band list: `q` searches the name (case-insensitive). */
export type AdminBandQuery = {
  page: number;
  perPage: number;
  sort: AdminBandSort;
  order: "asc" | "desc";
  q?: string | undefined;
};

/** `%` and `_` typed in a search are matched as themselves. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A page of bands for the admin console (#247), with their member count and band leaders (there
 * can be several), and the total matching the search. Ties keep one order (the id).
 */
export async function adminBandPage(db: Db, query: AdminBandQuery) {
  const where = query.q ? ilike(bands.name, likePattern(query.q)) : undefined;
  const members =
    sql<number>`(select count(*) from ${bandMembers} where ${bandMembers.bandId} = ${bands.id})`.mapWith(
      Number,
    );
  const sortColumn = {
    name: sql`lower(${bands.name})`,
    createdAt: bands.createdAt,
    members,
  }[query.sort];
  const direction = query.order === "desc" ? desc : asc;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: bands.id,
        name: bands.name,
        slug: bands.slug,
        genre: bands.genre,
        createdAt: bands.createdAt,
        members,
      })
      .from(bands)
      .where(where)
      .orderBy(direction(sortColumn), asc(bands.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ count: count() }).from(bands).where(where),
  ]);
  const leaders = rows.length
    ? await db
        .select({ bandId: bandMembers.bandId, id: users.id, name: users.name })
        .from(bandMembers)
        .innerJoin(users, eq(users.id, bandMembers.userId))
        .where(
          and(
            inArray(
              bandMembers.bandId,
              rows.map((row) => row.id),
            ),
            eq(bandMembers.role, "leader"),
          ),
        )
        .orderBy(asc(bandMembers.joinedAt))
    : [];
  return {
    data: rows.map((row) => ({
      ...row,
      leaders: leaders.filter((l) => l.bandId === row.id).map(({ bandId: _, ...l }) => l),
    })),
    total: total?.count ?? 0,
  };
}

/** One band as the admin console shows it (#247), by id; undefined when there's none. */
export async function adminBandOf(db: Db, id: string) {
  const [band] = await db
    .select({
      id: bands.id,
      name: bands.name,
      slug: bands.slug,
      genre: bands.genre,
      createdAt: bands.createdAt,
    })
    .from(bands)
    .where(eq(bands.id, id));
  return band;
}

/** Every membership, by band name, with the band's name and slug: the admin console. */
export function allMemberships(db: Db) {
  return db
    .select({
      userId: bandMembers.userId,
      bandName: bands.name,
      bandSlug: bands.slug,
      role: bandMembers.role,
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bands.id, bandMembers.bandId))
    .orderBy(asc(bands.name));
}

/** A band's members by join date: their names, role and avatar key (`users.image`). */
export function membersOf(db: Db, bandId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      nickname: users.nickname,
      role: bandMembers.role,
      joinedAt: bandMembers.joinedAt,
      image: users.image,
    })
    .from(bandMembers)
    .innerJoin(users, eq(users.id, bandMembers.userId))
    .where(eq(bandMembers.bandId, bandId))
    .orderBy(asc(bandMembers.joinedAt));
}

/** Someone joins a band (accepting an invitation), with their instruments in it. */
export async function addMember(
  tx: Tx,
  member: { bandId: string; userId: string; role: BandRole },
  instruments: readonly Instrument[],
  invitationId: string,
) {
  const { bandId, userId, role } = member;
  const [existing] = await tx
    .select({ userId: bandMembers.userId })
    .from(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)));
  if (existing) throw new AppError("already_member", "Already a member of this band");
  await tx.insert(bandMembers).values({ bandId, userId, role });
  await writeInstruments(tx, { bandId, userId }, instruments);
  await recordActivity(tx, {
    action: "member.joined",
    bandId,
    actorId: userId,
    target: { type: "user", id: userId },
    data: { role, invitationId },
  });
}

/** Changes a band's genre. The name (and so the URL) never changes: choose it carefully. */
export function updateBandGenre(
  db: Db,
  id: string,
  genre: string | null,
  actorId: string,
): Promise<{ name: string; slug: string; genre: string | null; logo: BandLogo | null }> {
  return db.transaction(async (tx) => {
    const [band] = await tx
      .update(bands)
      .set({ genre: genre?.trim() || null })
      .where(eq(bands.id, id))
      .returning();
    if (!band) throw new Error("Band update returned nothing");
    await recordActivity(tx, {
      action: "band.genre_changed",
      bandId: id,
      actorId,
      target: { type: "band", id },
      data: { genre: band.genre },
    });
    return { name: band.name, slug: band.slug, genre: band.genre, logo: logoOf(band) };
  });
}

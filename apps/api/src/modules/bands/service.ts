import { type BandRole, slugify } from "@coverband/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { isUniqueViolation } from "../../core/db/pg-errors";
import { bandMembers, bands } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { instrumentsByBand } from "../instruments/service";

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
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bands.id, bandMembers.bandId))
    .where(eq(bandMembers.userId, userId))
    .orderBy(asc(bands.name));
  const instruments = await instrumentsByBand(db, userId);
  return rows.map(({ bandId, ...band }) => ({
    ...band,
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

export async function createBand(
  tx: Tx,
  input: { name: string; genre?: string | undefined },
): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  if (!(await isBandNameAvailable(tx, name))) throw new BandNameTakenError();
  try {
    const [band] = await tx
      .insert(bands)
      .values({ name, slug: await freeSlug(tx, slugify(name)), genre: input.genre?.trim() || null })
      .returning({ id: bands.id, slug: bands.slug });
    if (!band) throw new Error("Band insert returned nothing");
    return band;
  } catch (error) {
    // Two people choosing the same name at the same moment: the unique index decides.
    throw isUniqueViolation(error, "bands_name_lower_unique") ? new BandNameTakenError() : error;
  }
}

/** Changes a band's genre. The name (and so the URL) never changes: choose it carefully. */
export function updateBandGenre(
  db: Db,
  id: string,
  genre: string | null,
  actorId: string,
): Promise<{ name: string; slug: string; genre: string | null }> {
  return db.transaction(async (tx) => {
    const [band] = await tx
      .update(bands)
      .set({ genre: genre?.trim() || null })
      .where(eq(bands.id, id))
      .returning({ name: bands.name, slug: bands.slug, genre: bands.genre });
    if (!band) throw new Error("Band update returned nothing");
    await recordActivity(tx, {
      action: "band.genre_changed",
      bandId: id,
      actorId,
      target: { type: "band", id },
      data: { genre: band.genre },
    });
    return band;
  });
}

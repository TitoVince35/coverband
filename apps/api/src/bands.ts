import { slugify } from "@coverband/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { bands } from "./db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class BandNameTakenError extends Error {
  constructor() {
    super("Band name already taken");
  }
}

/** Band names are unique regardless of case. `exceptId` ignores the band being renamed. */
export async function isBandNameAvailable(db: Db | Tx, name: string, exceptId?: string) {
  const sameName = eq(sql`lower(${bands.name})`, name.trim().toLowerCase());
  const [taken] = await db
    .select({ id: bands.id })
    .from(bands)
    .where(exceptId ? and(sameName, ne(bands.id, exceptId)) : sameName);
  return taken === undefined;
}

/** The slug itself if free, else slug-2, slug-3... (two names can give the same slug). */
async function freeSlug(tx: Tx, base: string, exceptId?: string): Promise<string> {
  const rows = await tx
    .select({ id: bands.id, slug: bands.slug })
    .from(bands)
    .where(sql`${bands.slug} = ${base} or ${bands.slug} like ${`${base}-%`}`);
  const used = new Set(rows.filter((row) => row.id !== exceptId).map((row) => row.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

/** Two people choosing the same name at the same moment: the unique index decides. */
function isNameClash(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } })?.cause;
  return cause?.code === "23505" && cause.constraint_name === "bands_name_lower_unique";
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
    throw isNameClash(error) ? new BandNameTakenError() : error;
  }
}

/**
 * Renames a band and/or changes its genre. A new name gives a new slug, so the band's URL
 * changes: the caller sends the new slug back.
 */
export async function updateBand(
  db: Db,
  id: string,
  input: { name?: string | undefined; genre?: string | null | undefined },
): Promise<{ name: string; slug: string; genre: string | null }> {
  try {
    return await db.transaction(async (tx) => {
      const changes: { name?: string; slug?: string; genre?: string | null } = {};
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!(await isBandNameAvailable(tx, name, id))) throw new BandNameTakenError();
        changes.name = name;
        changes.slug = await freeSlug(tx, slugify(name), id);
      }
      if (input.genre !== undefined) {
        changes.genre = input.genre?.trim() || null;
      }
      const [band] = await tx
        .update(bands)
        .set(changes)
        .where(eq(bands.id, id))
        .returning({ name: bands.name, slug: bands.slug, genre: bands.genre });
      if (!band) throw new Error("Band update returned nothing");
      return band;
    });
  } catch (error) {
    throw isNameClash(error) ? new BandNameTakenError() : error;
  }
}

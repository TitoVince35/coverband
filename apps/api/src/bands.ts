import { slugify } from "@coverband/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { bands } from "./db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class BandNameTakenError extends Error {
  constructor() {
    super("Band name already taken");
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

/** Changes a band's genre. The name (and so the URL) never changes: choose it carefully. */
export async function updateBandGenre(
  db: Db,
  id: string,
  genre: string | null,
): Promise<{ name: string; slug: string; genre: string | null }> {
  const [band] = await db
    .update(bands)
    .set({ genre: genre?.trim() || null })
    .where(eq(bands.id, id))
    .returning({ name: bands.name, slug: bands.slug, genre: bands.genre });
  if (!band) throw new Error("Band update returned nothing");
  return band;
}

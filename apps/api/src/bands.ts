import { slugify } from "@coverband/shared";
import { eq, sql } from "drizzle-orm";
import { recordActivity } from "./activity";
import type { Db, Tx } from "./db/client";
import { isUniqueViolation } from "./db/pg-errors";
import { bands } from "./db/schema";
import { AppError } from "./errors";

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

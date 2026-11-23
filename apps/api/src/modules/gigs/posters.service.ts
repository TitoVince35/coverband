import { GIG_POSTER_LIMITS } from "@coverband/shared";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import type { Db, Tx } from "../../core/db/client";
import { gigPosters } from "../../core/db/schema";
import { AppError } from "../../core/errors";
import { ImageTooLargeError, InvalidImageError, imageType } from "../../core/images";
import type { AppDeps } from "../../deps";

type Deps = Pick<AppDeps, "db" | "storage" | "log">;

/** The image formats a poster may be. */
const POSTER_FORMATS = ["image/webp", "image/jpeg", "image/png"] as const;

/** A gig has GIG_POSTER_LIMITS.perGig posters. */
export class TooManyPostersError extends AppError {
  constructor() {
    super("too_many_posters", `A gig has at most ${GIG_POSTER_LIMITS.perGig} posters`);
  }
}

/** Only the member who added a poster, or the band leader, removes it. */
export class NotYourPosterError extends AppError {
  constructor() {
    super("forbidden", "Only who added it or the band leader removes a poster");
  }
}

const posterColumns = {
  id: gigPosters.id,
  gigId: gigPosters.gigId,
  title: gigPosters.title,
  extension: gigPosters.extension,
  size: gigPosters.size,
  addedById: gigPosters.addedById,
  createdAt: gigPosters.createdAt,
};

export type GigPoster = {
  id: string;
  title: string;
  extension: string;
  size: number;
  addedById: string | null;
  createdAt: Date;
};

/** The posters of gigs, oldest first, by gig id. */
export async function postersOfGigs(db: Db | Tx, bandId: string, gigIds: readonly string[]) {
  const rows = gigIds.length
    ? await db
        .select(posterColumns)
        .from(gigPosters)
        .where(and(eq(gigPosters.bandId, bandId), inArray(gigPosters.gigId, [...gigIds])))
        .orderBy(asc(gigPosters.createdAt), asc(gigPosters.id))
    : [];
  const byGig = new Map<string, GigPoster[]>();
  for (const { gigId, ...poster } of rows) {
    byGig.set(gigId, [...(byGig.get(gigId) ?? []), poster]);
  }
  return byGig;
}

/** Deletes files; one that can't be is only an orphan: logged. */
export async function deletePosterFiles(
  { storage, log }: Pick<AppDeps, "storage" | "log">,
  keys: readonly string[],
) {
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (error) {
      log.warn("A gig poster's file was not deleted", { key, err: error });
    }
  }
}

/** The files of a gig's posters, read before it is deleted. */
export async function gigPosterKeys(db: Db | Tx, gigId: string) {
  const rows = await db
    .select({ key: gigPosters.storageKey })
    .from(gigPosters)
    .where(eq(gigPosters.gigId, gigId));
  return rows.map((row) => row.key);
}

/** The files of every poster of a band, read before the band is deleted. */
export async function bandPosterKeys(db: Db | Tx, bandId: string) {
  const rows = await db
    .select({ key: gigPosters.storageKey })
    .from(gigPosters)
    .where(eq(gigPosters.bandId, bandId));
  return rows.map((row) => row.key);
}

/**
 * Adds a poster to a gig (#330): an image (WebP, JPEG or PNG, read from its first bytes, never
 * SVG), within GIG_POSTER_LIMITS. The file is stored first, under a new key, and deleted again if
 * the poster isn't saved. `lockEditableGig` locks the gig and refuses a cancelled or past one;
 * false when the band has no such gig. `gig.poster_added`.
 */
export async function addPoster(
  { db, storage, log }: Deps,
  member: { bandId: string; userId: string },
  gigId: string,
  upload: { bytes: Uint8Array; title: string },
  lockEditableGig: (tx: Tx) => Promise<boolean>,
) {
  if (upload.bytes.length > GIG_POSTER_LIMITS.maxBytes) {
    throw new ImageTooLargeError(GIG_POSTER_LIMITS.maxBytes);
  }
  const format = imageType(upload.bytes, POSTER_FORMATS);
  if (!format) throw new InvalidImageError(POSTER_FORMATS);
  const key = `bands/${member.bandId}/gigs/${gigId}/posters/${crypto.randomUUID()}.${format.extension}`;
  await storage.put(key, upload.bytes, format.type);
  try {
    const id = await db.transaction(async (tx) => {
      if (!(await lockEditableGig(tx))) return null;
      const [gig] = await tx
        .select({ n: count() })
        .from(gigPosters)
        .where(eq(gigPosters.gigId, gigId));
      if ((gig?.n ?? 0) >= GIG_POSTER_LIMITS.perGig) throw new TooManyPostersError();
      const [poster] = await tx
        .insert(gigPosters)
        .values({
          bandId: member.bandId,
          gigId,
          title: upload.title,
          contentType: format.type,
          extension: format.extension,
          size: upload.bytes.length,
          storageKey: key,
          addedById: member.userId,
        })
        .returning({ id: gigPosters.id });
      await recordActivity(tx, {
        action: "gig.poster_added",
        bandId: member.bandId,
        actorId: member.userId,
        target: { type: "gig", id: gigId },
      });
      return poster?.id ?? null;
    });
    if (!id) {
      await deletePosterFiles({ storage, log }, [key]);
      return null;
    }
    return (
      (await postersOfGigs(db, member.bandId, [gigId])).get(gigId)?.find((p) => p.id === id) ?? null
    );
  } catch (error) {
    await deletePosterFiles({ storage, log }, [key]);
    throw error;
  }
}

/**
 * Removes a gig's poster: the member who added it or the band leader (NotYourPosterError for the
 * others), on a gig that can still change (`lockEditableGig`). Its file goes once the poster is
 * gone. `gig.poster_removed`. False when there's no such poster.
 */
export async function removePoster(
  deps: Deps,
  member: { bandId: string; userId: string; isLeader: boolean },
  gigId: string,
  posterId: string,
  lockEditableGig: (tx: Tx) => Promise<boolean>,
) {
  const key = await deps.db.transaction(async (tx) => {
    if (!(await lockEditableGig(tx))) return null;
    const [poster] = await tx
      .select({ key: gigPosters.storageKey, addedById: gigPosters.addedById })
      .from(gigPosters)
      .where(
        and(
          eq(gigPosters.bandId, member.bandId),
          eq(gigPosters.gigId, gigId),
          eq(gigPosters.id, posterId),
        ),
      );
    if (!poster) return null;
    if (!member.isLeader && poster.addedById !== member.userId) throw new NotYourPosterError();
    await tx.delete(gigPosters).where(eq(gigPosters.id, posterId));
    await recordActivity(tx, {
      action: "gig.poster_removed",
      bandId: member.bandId,
      actorId: member.userId,
      target: { type: "gig", id: gigId },
    });
    return poster.key;
  });
  if (!key) return false;
  await deletePosterFiles(deps, [key]);
  return true;
}

/** A poster's file for a member of its band, or null. */
export async function readPoster(
  { db, storage }: Pick<AppDeps, "db" | "storage">,
  bandId: string,
  gigId: string,
  posterId: string,
) {
  const [poster] = await db
    .select({
      key: gigPosters.storageKey,
      title: gigPosters.title,
      type: gigPosters.contentType,
      extension: gigPosters.extension,
      size: gigPosters.size,
    })
    .from(gigPosters)
    .where(
      and(eq(gigPosters.bandId, bandId), eq(gigPosters.gigId, gigId), eq(gigPosters.id, posterId)),
    );
  if (!poster) return null;
  const object = await storage.get(poster.key);
  return object ? { ...object, ...poster } : null;
}

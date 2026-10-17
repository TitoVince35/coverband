import { ADMIN_ROLE, avatarUrl } from "@coverband/shared";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordActivity } from "./activity";
import type { AppDeps } from "./app";
import { bandMembers, users } from "./db/schema";

type Deps = Pick<AppDeps, "db" | "storage">;

/** Accepted formats, recognised by their first bytes (never by the declared content type). */
export function imageType(bytes: Uint8Array): { type: string; extension: string } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { type: "image/webp", extension: "webp" };
  }
  // Safari can't encode WebP from a canvas: it uploads JPEG.
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "image/jpeg", extension: "jpg" };
  }
  return null;
}

export class InvalidImageError extends Error {
  constructor() {
    super("Not a WebP or JPEG image");
  }
}

/**
 * Replaces the user's avatar. The file gets a new key (so its URL changes and caches stay valid);
 * the previous file is deleted once the user points to the new one.
 */
export async function setAvatar({ db, storage }: Deps, userId: string, bytes: Uint8Array) {
  const format = imageType(bytes);
  if (!format) throw new InvalidImageError();
  const key = `users/${userId}/avatar/${crypto.randomUUID()}.${format.extension}`;
  await storage.put(key, bytes, format.type);

  let previous: string | null;
  try {
    previous = await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      await tx.update(users).set({ image: key }).where(eq(users.id, userId));
      await recordActivity(tx, {
        action: "user.avatar_changed",
        bandId: null,
        actorId: userId,
        target: { type: "user", id: userId },
        data: { removed: false },
      });
      return user?.image ?? null;
    });
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
  await deleteQuietly({ db, storage }, previous);
  return avatarUrl(userId, key);
}

/** Removes the user's avatar: the default one shows again. Nothing to do without one. */
export async function removeAvatar({ db, storage }: Deps, userId: string) {
  const previous = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user?.image) return null;
    await tx.update(users).set({ image: null }).where(eq(users.id, userId));
    await recordActivity(tx, {
      action: "user.avatar_changed",
      bandId: null,
      actorId: userId,
      target: { type: "user", id: userId },
      data: { removed: true },
    });
    return user.image;
  });
  await deleteQuietly({ db, storage }, previous);
}

/** The user no longer points to it: a failed delete only leaves an orphan file behind. */
async function deleteQuietly({ storage }: Deps, key: string | null) {
  if (!key) return;
  try {
    await storage.delete(key);
  } catch (error) {
    console.error(`Could not delete ${key}`, error);
  }
}

/** Avatars are seen by the user, admins, and the people sharing a band with them. */
async function canSee(
  { db }: Deps,
  viewer: { id: string; role?: string | null | undefined },
  userId: string,
) {
  if (viewer.id === userId || viewer.role === ADMIN_ROLE) return true;
  const theirs = alias(bandMembers, "theirs");
  const [shared] = await db
    .select({ bandId: bandMembers.bandId })
    .from(bandMembers)
    .innerJoin(theirs, and(eq(theirs.bandId, bandMembers.bandId), eq(theirs.userId, userId)))
    .where(eq(bandMembers.userId, viewer.id))
    .limit(1);
  return shared !== undefined;
}

/** The avatar file, or null when there is none or the viewer may not see it (a 404 either way). */
export async function readAvatar(
  deps: Deps,
  viewer: { id: string; role?: string | null | undefined },
  userId: string,
) {
  if (!(await canSee(deps, viewer, userId))) return null;
  const [user] = await deps.db
    .select({ image: users.image })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.image) return null;
  const object = await deps.storage.get(user.image);
  return object ? { ...object, url: avatarUrl(userId, user.image) } : null;
}

import { ADMIN_ROLE, avatarUrl } from "@coverband/shared";
import { eq } from "drizzle-orm";
import { recordActivity } from "../../core/activity/record";
import { users } from "../../core/db/schema";
import { InvalidImageError, imageType } from "../../core/images";
import type { AppDeps } from "../../deps";
import { shareABand } from "../bands/service";

type Deps = Pick<AppDeps, "db" | "storage" | "log">;

/** Formats the browser sends: WebP, or JPEG from Safari (it can't encode WebP from a canvas). */
const AVATAR_TYPES = ["image/webp", "image/jpeg"] as const;

/**
 * `users.image` as a key this server wrote for this user, or null. A second guard, behind Better
 * Auth's disabled /update-user: another value is never read or deleted.
 */
export function ownAvatarKey(userId: string, image: string | null | undefined): string | null {
  const pattern = new RegExp(`^users/${userId}/avatar/[0-9a-f-]{36}\\.(webp|jpg)$`);
  return image && pattern.test(image) ? image : null;
}

/**
 * Replaces the user's avatar. The file gets a new key (so its URL changes and caches stay valid);
 * the previous file is deleted once the user points to the new one.
 */
export async function setAvatar({ db, storage, log }: Deps, userId: string, bytes: Uint8Array) {
  const format = imageType(bytes, AVATAR_TYPES);
  if (!format) throw new InvalidImageError(AVATAR_TYPES);
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
      return ownAvatarKey(userId, user?.image);
    });
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
  await deleteQuietly({ db, storage, log }, previous);
  return avatarUrl(userId, key);
}

/** Removes the user's avatar: the default one shows again. Nothing to do without one. */
export async function removeAvatar({ db, storage, log }: Deps, userId: string) {
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
    return ownAvatarKey(userId, user.image);
  });
  await deleteQuietly({ db, storage, log }, previous);
}

/** The user no longer points to it: a failed delete only leaves an orphan file behind. */
async function deleteQuietly({ storage, log }: Deps, key: string | null) {
  if (!key) return;
  try {
    await storage.delete(key);
  } catch (error) {
    log.warn("Old avatar not deleted", { key, err: error });
  }
}

/** Avatars are seen by the user, admins, and the people sharing a band with them. */
async function canSee(
  { db }: Deps,
  viewer: { id: string; role?: string | null | undefined },
  userId: string,
) {
  if (viewer.id === userId || viewer.role === ADMIN_ROLE) return true;
  return shareABand(db, viewer.id, userId);
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
  const key = ownAvatarKey(userId, user?.image);
  if (!key) return null;
  const object = await deps.storage.get(key);
  return object ? { ...object, url: avatarUrl(userId, key) } : null;
}

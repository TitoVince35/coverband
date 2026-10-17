/**
 * URL of a user's avatar, or null without one. `image` is the storage key kept on the user
 * (`users/{id}/avatar/{uuid}.webp`): its UUID versions the URL, so browsers can cache it for good.
 */
export function avatarUrl(userId: string, image: string | null | undefined): string | null {
  if (!image) return null;
  const version = image.split("/").pop()?.split(".")[0] ?? "";
  return `/api/users/${userId}/avatar?v=${version}`;
}

/** Largest side of an uploaded avatar, in pixels: the browser crops and resizes before upload. */
export const AVATAR_SIZE = 512;

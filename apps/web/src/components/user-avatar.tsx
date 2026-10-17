import { avatarUrl } from "@coverband/shared";
import BoringAvatar from "boring-avatars";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Colours of the default avatars: the brand emerald plus warm stage-light accents. */
const DEFAULT_COLORS = ["#007a55", "#00bc7d", "#fe9a00", "#f6339a", "#8e51ff"];

type Props = {
  user: { id: string; name: string };
  /** The avatar's URL: `avatarUrl` from the API, or computed from the session user's `image`. */
  src: string | null | undefined;
  className?: string;
};

/**
 * A user's avatar: their photo, or a default face drawn in the browser from their ID (always the
 * same for one user, no network call). Decorative: the name is always shown next to it.
 */
export function UserAvatar({ user, src, className }: Props) {
  // A file that can't be loaded (deleted meanwhile, offline) falls back to the default.
  const [failed, setFailed] = useState<string | null>(null);
  const size = cn("block size-10 shrink-0 overflow-hidden rounded-full", className);
  if (src && failed !== src) {
    return (
      <img src={src} alt="" className={cn(size, "object-cover")} onError={() => setFailed(src)} />
    );
  }
  return (
    <span className={size} aria-hidden>
      <BoringAvatar name={user.id} variant="beam" colors={DEFAULT_COLORS} square size="100%" />
    </span>
  );
}

/** The session user's avatar URL (the session carries the storage key in `image`). */
export function sessionAvatarUrl(user: { id: string; image?: string | null | undefined }) {
  return avatarUrl(user.id, user.image);
}

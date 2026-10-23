import { type MediaProvider, mediaProvider } from "@coverband/shared";
import { Link2 } from "lucide-react";
import type { CSSProperties } from "react";
import {
  type SimpleIcon,
  siApplemusic,
  siDeezer,
  siMixcloud,
  siSoundcloud,
  siSpotify,
  siYoutube,
} from "simple-icons";
import { cn } from "@/lib/utils";

/**
 * Brand logos from simple-icons (CC0), bundled: nothing is loaded from another origin. A brand
 * colour under 3:1 on a theme's cards is too faint there: the logo takes the text colour instead.
 */
const ICONS: Record<MediaProvider, { icon: SimpleIcon; faintOn?: "light" | "dark" }> = {
  youtube: { icon: siYoutube },
  spotify: { icon: siSpotify, faintOn: "light" },
  deezer: { icon: siDeezer },
  apple_music: { icon: siApplemusic },
  soundcloud: { icon: siSoundcloud },
  mixcloud: { icon: siMixcloud, faintOn: "dark" },
};

/** How a brand logo is filled, by the theme it is too faint on (document icons too). */
export const BRAND_FILL = {
  light: "fill-foreground dark:fill-(--brand)",
  dark: "fill-(--brand) dark:fill-foreground",
  none: "fill-(--brand)",
};

/** The logo of the site a link points to (a chain link for any other site). Decorative. */
export function ProviderIcon({ url, className }: { url: string; className?: string }) {
  const provider = mediaProvider(url);
  if (!provider) {
    return <Link2 aria-hidden className={cn("size-5 text-muted-foreground", className)} />;
  }
  const { icon, faintOn = "none" } = ICONS[provider];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-5", BRAND_FILL[faintOn], className)}
      style={{ "--brand": `#${icon.hex}` } as CSSProperties}
    >
      <path d={icon.path} />
    </svg>
  );
}

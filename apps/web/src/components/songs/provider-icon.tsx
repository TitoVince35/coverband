import { type MediaProvider, mediaProvider } from "@coverband/shared";
import { Link2 } from "lucide-react";
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

/** Brand logos from simple-icons (CC0), bundled: nothing is loaded from another origin. */
const ICONS: Record<MediaProvider, SimpleIcon> = {
  youtube: siYoutube,
  spotify: siSpotify,
  deezer: siDeezer,
  apple_music: siApplemusic,
  soundcloud: siSoundcloud,
  mixcloud: siMixcloud,
};

/** Too dark on the dark theme's cards (under 3:1): drawn in the text colour there. */
const DARK_ON_DARK: readonly MediaProvider[] = ["mixcloud"];

/** The logo of the site a link points to (a chain link for any other site). Decorative. */
export function ProviderIcon({ url, className }: { url: string; className?: string }) {
  const provider = mediaProvider(url);
  if (!provider) {
    return <Link2 aria-hidden className={cn("size-5 text-muted-foreground", className)} />;
  }
  const icon = ICONS[provider];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-5", DARK_ON_DARK.includes(provider) && "dark:fill-foreground", className)}
      fill={`#${icon.hex}`}
    >
      <path d={icon.path} />
    </svg>
  );
}

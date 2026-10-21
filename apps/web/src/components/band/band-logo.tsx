import type { BandLogo as Logo } from "@coverband/shared";
import { useEffect, useState } from "react";
import { bandInitials } from "@/lib/initials";
import { savedLogo } from "@/lib/offline-logos";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

type Size = "small" | "header" | "large";

/**
 * Where the logo's image comes from (#178): the server online; the copy saved on the device
 * offline, or when the server's image doesn't load (a venue's Wi-Fi). Null: no image to show
 * (no logo, or none saved); undefined: the saved copy is being read.
 */
function useLogoSource(bandSlug: string, logo: Logo | null, size: Size) {
  const online = useOnline();
  const serverUrl = logo ? (size === "large" ? logo.url : logo.thumbnailUrl) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fromDevice = logo !== null && (!online || failedUrl === serverUrl);
  const logoUrl = logo?.url;
  const [savedUrl, setSavedUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!fromDevice || !logoUrl) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    savedLogo(bandSlug, logoUrl).then((blob) => {
      if (cancelled) return;
      objectUrl = blob ? URL.createObjectURL(blob) : null;
      setSavedUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSavedUrl(undefined);
    };
  }, [fromDevice, bandSlug, logoUrl]);

  return {
    src: fromDevice ? savedUrl : serverUrl,
    onError: fromDevice ? undefined : () => setFailedUrl(serverUrl),
  };
}

/** Where each size shows: the band list's square, the header's small square, the home page. */
const BOX: Record<Size, string> = {
  small: "size-12 shrink-0",
  // As tall as the band's name and genre (two lines), as wide as the logo needs, up to a point.
  header: "h-14 w-auto max-w-[40%] shrink-0",
  large: "w-full",
};

/**
 * A band's logo as it is, with no background (#189): the band leader uploads a logo that reads on
 * the app's dark background. `small`: the thumbnail, in a square (the band list), the band's
 * initials without a logo; `header`: the thumbnail on the right of the band's name, as tall as the name and genre, nothing
 * without one;
 * `large`: the whole logo, as wide as the page and at most a third of the screen's height (the
 * band's home page), nothing without one. Shown from the device offline (#178). Decorative: the
 * band's name is always next to it.
 */
export function BandLogo({
  band,
  size,
  className,
}: {
  band: { name: string; slug: string; logo: Logo | null };
  size: Size;
  className?: string;
}) {
  const { src, onError } = useLogoSource(band.slug, band.logo, size);
  if (band.logo && src) {
    return (
      <img
        src={src}
        alt=""
        onError={onError}
        className={cn(
          "object-contain",
          BOX[size],
          size === "large" && "mx-auto max-h-[33svh]",
          className,
        )}
      />
    );
  }
  if (size !== "small") return null;
  if (band.logo && src === undefined) {
    // Reading the saved copy: an empty square of the same size, without flashing the initials.
    return <div aria-hidden="true" className={cn(BOX.small, className)} />;
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center rounded-md bg-primary font-heading font-semibold text-base text-primary-foreground",
        BOX.small,
        className,
      )}
    >
      {bandInitials(band.name)}
    </div>
  );
}

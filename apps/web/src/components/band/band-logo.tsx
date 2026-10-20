import type { BandLogo as Logo } from "@coverband/shared";
import { useEffect, useState } from "react";
import { LogoPlate } from "@/components/band/logo-plate";
import { bandInitials } from "@/lib/initials";
import { savedLogo } from "@/lib/offline-logos";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

type Size = "small" | "large";

/**
 * Where the logo's image comes from (#178): the server online; the copy saved on the device
 * offline, or when the server's image doesn't load (a venue's Wi-Fi). Null: no image to show
 * (no logo, or none saved); undefined: the saved copy is being read.
 */
function useLogoSource(bandSlug: string, logo: Logo | null, size: Size) {
  const online = useOnline();
  const serverUrl = logo ? (size === "small" ? logo.thumbnailUrl : logo.url) : null;
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

/**
 * A band's logo on its background (#177), or its initials when it has none, or none is
 * available offline. `small`: the thumbnail, in a square (the band list); `large`: the full logo,
 * as wide as it needs (the band's home page). Decorative: the band's name is always next to it.
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
  const box = size === "small" ? "size-12 shrink-0 p-1" : "h-32 w-full max-w-sm p-4";
  if (band.logo && src) {
    return (
      <LogoPlate
        src={src}
        background={band.logo.background}
        alt=""
        className={cn(box, className)}
        onError={onError}
      />
    );
  }
  if (band.logo && src === undefined) {
    // Reading the saved copy: an empty plate of the same size, without flashing the initials.
    return <div aria-hidden="true" className={cn(box, className)} />;
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center rounded-md bg-primary font-heading font-semibold text-primary-foreground",
        size === "small" ? "size-12 shrink-0 text-base" : "size-32 text-4xl",
        className,
      )}
    >
      {bandInitials(band.name)}
    </div>
  );
}

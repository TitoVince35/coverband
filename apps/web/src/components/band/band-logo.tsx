import type { BandLogo as Logo } from "@coverband/shared";
import { LogoPlate } from "@/components/band/logo-plate";
import { bandInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

/**
 * A band's logo on its background (#177), or its initials when it has none. `small`: the
 * thumbnail, in a square (the band list); `large`: the full logo, as wide as it needs (the band's
 * home page). Decorative: the band's name is always next to it.
 */
export function BandLogo({
  band,
  size,
  className,
}: {
  band: { name: string; logo: Logo | null };
  size: "small" | "large";
  className?: string;
}) {
  const box = size === "small" ? "size-12 shrink-0 p-1" : "h-32 w-full max-w-sm p-4";
  if (band.logo) {
    return (
      <LogoPlate
        src={size === "small" ? band.logo.thumbnailUrl : band.logo.url}
        background={band.logo.background}
        alt=""
        className={cn(box, className)}
      />
    );
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

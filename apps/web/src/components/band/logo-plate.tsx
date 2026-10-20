import type { LogoBackground } from "@coverband/shared";
import { cn } from "@/lib/utils";

/**
 * A band logo on the background its band leader chose, whatever the app's theme: a black logo on
 * a transparent background stays visible in dark mode. The whole logo shows, never cropped.
 */
export function LogoPlate({
  src,
  background,
  alt,
  className,
}: {
  src: string;
  background: LogoBackground;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-md p-2 ring-1 ring-border",
        // Fixed colours, on purpose: the plate is the logo's, not the theme's.
        background === "dark" ? "bg-[#0c090c]" : "bg-white",
        className,
      )}
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

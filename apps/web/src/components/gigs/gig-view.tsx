import { MapPin, Navigation } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GigStatusBadge } from "@/components/gigs/gig-status";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/use-language";
import { formatGigDate, formatTimeOfDay } from "@/lib/gig-format";
import { directionsUrl, type Gig, gigName } from "@/lib/gigs";
import { isIos } from "@/lib/install";
import { cn } from "@/lib/utils";

/**
 * A gig's compact view (brief 034): what a member needs on the day, read-only. Its status and
 * type, name, date and times, then its venue with a Directions link; `children` adds the blocks
 * that follow.
 */
export function GigView({ gig, children }: { gig: Gig; children?: ReactNode }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const cancelled = gig.status === "cancelled";
  const times = [
    gig.showTime
      ? t("gigs.view.showTime", { time: formatTimeOfDay(gig.showTime, language) })
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <GigStatusBadge status={gig.status} />
          <span className="text-muted-foreground text-xs">{t(`gigs.type.${gig.type}`)}</span>
        </div>
        <h2
          className={cn(
            "break-words font-bold font-heading text-2xl",
            cancelled && "text-muted-foreground line-through",
          )}
        >
          {gigName(gig)}
        </h2>
        <p>{formatGigDate(gig.date, language, new Date().getFullYear())}</p>
        {times.length > 0 && <p className="text-muted-foreground text-sm">{times.join(" · ")}</p>}
      </div>
      {gig.venue && <VenueCard venue={gig.venue} />}
      {children}
    </div>
  );
}

/** The venue: its name, address and city, and Directions (the phone's maps app). */
export function VenueCard({ venue, map }: { venue: NonNullable<Gig["venue"]>; map?: ReactNode }) {
  const { t } = useTranslation();
  const ios = isIos(navigator.userAgent, navigator.maxTouchPoints);
  return (
    <section
      aria-label={t("gigs.venue.title")}
      className="overflow-hidden rounded-xl border bg-card"
    >
      {map}
      <div className="flex items-center gap-3 p-3">
        <MapPin aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{venue.name}</p>
          <p className="break-words text-muted-foreground text-sm">
            {[venue.address, venue.city].filter(Boolean).join(", ")}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="h-10">
          <a href={directionsUrl(venue, ios)} target="_blank" rel="noreferrer">
            <Navigation />
            {t("gigs.view.directions")}
          </a>
        </Button>
      </div>
    </section>
  );
}

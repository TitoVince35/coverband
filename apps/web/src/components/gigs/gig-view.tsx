import { Ban, MapPin, Navigation } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GigProgram, GigSetlistCard, GoodToKnow } from "@/components/gigs/gig-blocks";
import { GigContactsList } from "@/components/gigs/gig-contacts";
import { PostersList } from "@/components/gigs/gig-posters";
import { GigStatusBadge } from "@/components/gigs/gig-status";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/use-language";
import { formatDate } from "@/lib/format";
import { formatGigDate, formatTimeOfDay } from "@/lib/gig-format";
import { directionsUrl, gigName } from "@/lib/gig-rules";
import type { Gig } from "@/lib/gigs";
import { isIos } from "@/lib/install";
import { cn } from "@/lib/utils";

/**
 * A gig's compact view (brief 034): what a member needs on the day, read-only. Its status and
 * type, name, date and times, then its venue with a Directions link; `children` adds the blocks
 * that follow.
 */
export function GigView({
  bandSlug,
  gig,
  children,
}: {
  bandSlug: string;
  gig: Gig;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const cancelled = gig.status === "cancelled";
  const times = [
    gig.getInTime ? t("gigs.view.getIn", { time: formatTimeOfDay(gig.getInTime, language) }) : null,
    gig.showTime
      ? t("gigs.view.showTime", { time: formatTimeOfDay(gig.showTime, language) })
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {cancelled && <CancelledBanner gig={gig} />}
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
      {gig.setlistId && <GigSetlistCard bandSlug={bandSlug} setlistId={gig.setlistId} />}
      <GigContactsList
        venueName={gig.venue?.name ?? null}
        venueContacts={gig.venue?.contacts ?? []}
        gigContacts={gig.contacts}
      />
      {children}
      <GigProgram gig={gig} />
      <GoodToKnow gig={gig} />
      <PostersList bandSlug={bandSlug} gig={gig} />
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

/** At the top of a cancelled gig: who cancelled it and when, the reason; it's read-only. */
function CancelledBanner({ gig }: { gig: Gig }) {
  const { t } = useTranslation();
  const language = useLanguage();
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/60"
    >
      <Ban aria-hidden className="mt-0.5 size-5 shrink-0 text-red-700 dark:text-red-300" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold text-red-900 dark:text-red-200">
          {gig.cancelledAt
            ? t("gigs.cancelled.byOn", {
                name: gig.cancelledBy ?? t("journal.someone"),
                date: formatDate(gig.cancelledAt, language),
              })
            : t("gigs.status.cancelled")}
        </p>
        {gig.cancelledReason && (
          <p className="whitespace-pre-line break-words text-sm">{gig.cancelledReason}</p>
        )}
        <p className="text-muted-foreground text-xs">{t("gigs.cancelled.readOnly")}</p>
      </div>
    </div>
  );
}

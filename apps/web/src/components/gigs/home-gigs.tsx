import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MonitorPlay, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GigDateTile } from "@/components/gigs/gig-list";
import { GigStatusBadge } from "@/components/gigs/gig-status";
import { songsDuration } from "@/components/setlists/setlist-duration";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/i18n/use-language";
import { formatTimeOfDay } from "@/lib/gig-format";
import { gigName, homeGigs } from "@/lib/gig-rules";
import { type GigSummary, gigsQuery } from "@/lib/gigs";
import { enterFullscreen } from "@/lib/live";
import { setlistQuery } from "@/lib/setlists";

/** The band's gigs for its home page: today's and the upcoming ones (cancelled ones left out). */
export function useHomeGigs(bandSlug: string) {
  const gigs = useQuery(gigsQuery(bandSlug)).data;
  return gigs ? homeGigs(gigs) : null;
}

/**
 * "Today's gig" (#331), at the top of the band's home page while a gig is today (until 6 AM the
 * next morning): each one's name, city, get-in and show times and setlist, "View the gig" and
 * "Live setlist".
 */
export function TodaysGigCard({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const home = useHomeGigs(bandSlug);
  if (!home || home.today.length === 0) return null;
  return (
    <section
      aria-labelledby="todays-gig"
      className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/60"
    >
      <h2
        id="todays-gig"
        className="flex items-center gap-2 font-heading font-semibold text-emerald-800 dark:text-emerald-300"
      >
        <Sun aria-hidden className="size-5" />
        {t("gigs.home.today", { count: home.today.length })}
      </h2>
      <ul className="divide-y divide-emerald-200 dark:divide-emerald-900">
        {home.today.map((gig) => (
          <TodaysGig key={gig.id} bandSlug={bandSlug} gig={gig} />
        ))}
      </ul>
    </section>
  );
}

function TodaysGig({ bandSlug, gig }: { bandSlug: string; gig: GigSummary }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const setlist = useQuery({
    ...setlistQuery(bandSlug, gig.setlistId ?? ""),
    enabled: gig.setlistId !== null,
  }).data;
  const details = [
    gig.venue?.city,
    gig.getInTime ? t("gigs.view.getIn", { time: formatTimeOfDay(gig.getInTime, language) }) : null,
    gig.soundcheckTime
      ? t("gigs.view.soundcheck", { time: formatTimeOfDay(gig.soundcheckTime, language) })
      : null,
    gig.showTime
      ? t("gigs.view.showTime", { time: formatTimeOfDay(gig.showTime, language) })
      : null,
  ].filter(Boolean);
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="space-y-0.5">
        <p className="break-words font-bold text-lg">{gigName(gig)}</p>
        {details.length > 0 && <p className="text-sm">{details.join(" · ")}</p>}
        {setlist && (
          <p className="text-muted-foreground text-sm">
            {t("gigs.home.setlist", {
              title: setlist.title,
              duration: songsDuration(
                t,
                setlist.parts.flatMap((part) => part.songs),
              ),
            })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="flex-1">
          <Link to="/b/$bandSlug/gigs/$gigId" params={{ bandSlug, gigId: gig.id }}>
            {t("gigs.home.view")}
          </Link>
        </Button>
        {gig.setlistId && (
          <Button asChild variant="outline" className="flex-1">
            <Link
              to="/b/$bandSlug/setlists/$setlistId/live"
              params={{ bandSlug, setlistId: gig.setlistId }}
              onClick={enterFullscreen}
            >
              <MonitorPlay />
              {t("gigs.home.live")}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

/** "nn upcoming gigs" (#331): up to 5, the soonest first; hidden when none is to come. */
export function UpcomingGigsCard({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const home = useHomeGigs(bandSlug);
  if (!home || home.upcomingCount === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline gap-2">
        <CardTitle className="flex-1 font-heading">
          {t("gigs.home.upcoming", { count: home.upcomingCount })}
        </CardTitle>
        <Link
          to="/b/$bandSlug/gigs"
          params={{ bandSlug }}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          {t("gigs.home.all")}
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" aria-label={t("gigs.home.upcomingList")}>
          {home.upcoming.map((gig) => (
            <li key={gig.id}>
              <Link
                to="/b/$bandSlug/gigs/$gigId"
                params={{ bandSlug, gigId: gig.id }}
                className="flex items-center gap-3 rounded-lg py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GigDateTile date={gig.date} className="w-11 bg-transparent py-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{gigName(gig)}</span>
                  {gig.venue && (
                    <span className="block truncate text-muted-foreground text-sm">
                      {gig.venue.city}
                    </span>
                  )}
                </span>
                <GigStatusBadge status={gig.status} />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

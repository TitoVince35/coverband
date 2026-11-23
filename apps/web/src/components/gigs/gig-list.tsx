import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { GigStatusBadge } from "@/components/gigs/gig-status";
import { useLanguage } from "@/i18n/use-language";
import { gigDateParts } from "@/lib/gig-format";
import { gigName } from "@/lib/gig-rules";
import type { GigSummary } from "@/lib/gigs";
import { cn } from "@/lib/utils";

/** A gig's date as a calendar tile: weekday, day, month (and the year when it isn't this one). */
export function GigDateTile({ date, className }: { date: string; className?: string }) {
  const language = useLanguage();
  const parts = gigDateParts(date, language);
  const thisYear = String(new Date().getFullYear());
  return (
    <span
      aria-hidden
      className={cn(
        "flex w-13 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5 text-center leading-tight",
        className,
      )}
    >
      <span className="text-[11px] text-muted-foreground uppercase">{parts.weekday}</span>
      <span className="font-bold text-xl tabular-nums">{parts.day}</span>
      <span className="text-[11px] text-muted-foreground uppercase">
        {parts.month}
        {parts.year !== thisYear && ` ${parts.year.slice(2)}`}
      </span>
    </span>
  );
}

/**
 * Gigs as cards (brief 034): the date, the name (crossed out when cancelled), the city and the
 * venue, the status and the type. The card opens the compact view; `actions` adds a gig's menu.
 */
export function GigList({
  bandSlug,
  gigs,
  actions,
}: {
  bandSlug: string;
  gigs: readonly GigSummary[];
  actions?: (gig: GigSummary) => React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-2" aria-label={t("gigs.title")}>
      {gigs.map((gig) => {
        const cancelled = gig.status === "cancelled";
        const where = gig.venue
          ? [gig.venue.city, gig.title ? gig.venue.name : null].filter(Boolean).join(" · ")
          : null;
        return (
          <li
            key={gig.id}
            className={cn("flex items-center rounded-xl border bg-card", cancelled && "opacity-80")}
          >
            <Link
              to="/b/$bandSlug/gigs/$gigId"
              params={{ bandSlug, gigId: gig.id }}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GigDateTile date={gig.date} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span
                  className={cn(
                    "block truncate font-semibold",
                    cancelled && "text-muted-foreground line-through",
                  )}
                >
                  {gigName(gig)}
                </span>
                {where && (
                  <span className="block truncate text-muted-foreground text-sm">{where}</span>
                )}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <GigStatusBadge status={gig.status} />
                  <span className="text-muted-foreground text-xs">
                    {t(`gigs.type.${gig.type}`)}
                  </span>
                </span>
              </span>
            </Link>
            {actions && <div className="px-1">{actions(gig)}</div>}
          </li>
        );
      })}
    </ul>
  );
}

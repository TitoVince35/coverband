import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GigPagesNav } from "@/components/gigs/gig-pages-nav";
import { ListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, replacesData } from "@/lib/errors";
import { venuesQuery } from "@/lib/gigs";
import { useOnline } from "@/lib/online";
import { searchVenues } from "@/lib/venue-search";

// The band's venues (#334): each with its city, contacts and gigs, a search; each opens its page.
export const Route = createFileRoute("/_app/b/$bandSlug/venues/")({
  component: VenuesPage,
});

function VenuesPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const venues = useQuery(venuesQuery(bandSlug));
  const online = useOnline();
  const [search, setSearch] = useState("");
  const shown = venues.data ? searchVenues(venues.data, search) : [];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="flex-1 font-heading font-semibold text-lg">{t("gigs.venues.title")}</h2>
        {online ? (
          <Button asChild>
            <Link to="/b/$bandSlug/venues/new" params={{ bandSlug }}>
              <Plus />
              {t("gigs.venue.newButton")}
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <Plus />
            {t("gigs.venue.newButton")}
          </Button>
        )}
      </div>
      <GigPagesNav bandSlug={bandSlug} />
      <div className="relative">
        <Search
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t("gigs.venues.search")}
          placeholder={t("gigs.venues.search")}
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {venues.isPending ? (
        <ListSkeleton rows={4} />
      ) : venues.data === undefined || replacesData(venues.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, venues.error)}
        </p>
      ) : venues.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("gigs.venues.empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label={t("gigs.venues.title")}>
          {shown.map((venue) => (
            <li key={venue.id}>
              <Link
                to="/b/$bandSlug/venues/$venueId"
                params={{ bandSlug, venueId: venue.id }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MapPin aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{venue.name}</span>
                  <span className="block truncate text-muted-foreground text-sm">
                    {venue.city} · {t("gigs.venues.contactCount", { count: venue.contacts.length })}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground text-sm">
                  {t("gigs.venue.gigCount", { count: venue.gigs })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

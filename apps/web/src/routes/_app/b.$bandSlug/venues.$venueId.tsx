import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { VenueEditor } from "@/components/gigs/venue-editor";
import { ListSkeleton } from "@/components/loading";
import { errorMessage, replacesData } from "@/lib/errors";
import { venueQuery } from "@/lib/gigs";

// A venue of the band (#334): every field, its contacts, its gigs.
export const Route = createFileRoute("/_app/b/$bandSlug/venues/$venueId")({
  component: VenuePage,
});

function VenuePage() {
  const { t } = useTranslation();
  const { bandSlug, venueId } = Route.useParams();
  const venue = useQuery(venueQuery(bandSlug, venueId));
  return (
    <section className="space-y-4">
      <Link
        to="/b/$bandSlug/venues"
        params={{ bandSlug }}
        className="-ml-1 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t("gigs.venues.title")}
      </Link>
      {venue.isPending ? (
        <ListSkeleton rows={4} />
      ) : venue.data === undefined || replacesData(venue.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, venue.error)}
        </p>
      ) : (
        <>
          <h2 className="break-words font-heading font-semibold text-xl">{venue.data.name}</h2>
          {/* Saved since: a fresh form on its new details. */}
          <VenueEditor key={`${venue.dataUpdatedAt}`} bandSlug={bandSlug} venue={venue.data} />
        </>
      )}
    </section>
  );
}

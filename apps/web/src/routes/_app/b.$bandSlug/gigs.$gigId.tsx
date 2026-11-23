import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GigActions, useGigRights } from "@/components/gigs/gig-actions";
import { GigView } from "@/components/gigs/gig-view";
import { ListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { errorMessage, replacesData } from "@/lib/errors";
import { gigQuery } from "@/lib/gigs";
import { useOnline } from "@/lib/online";

// A gig's compact view (brief 034): what a member needs on the day, with Edit in the header.
export const Route = createFileRoute("/_app/b/$bandSlug/gigs/$gigId")({
  component: GigPage,
});

function GigPage() {
  const { t } = useTranslation();
  const { bandSlug, gigId } = Route.useParams();
  const gig = useQuery(gigQuery(bandSlug, gigId));
  const online = useOnline();
  const navigate = useNavigate();
  const rights = useGigRights(
    bandSlug,
    gig.data ?? { status: "cancelled", date: "1970-01-01", createdById: null },
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to="/b/$bandSlug/gigs"
          params={{ bandSlug }}
          className="-ml-1 inline-flex flex-1 items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t("gigs.back")}
        </Link>
        {gig.data &&
          rights.edit &&
          (online ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/b/$bandSlug/gigs/$gigId/edit" params={{ bandSlug, gigId }}>
                <Pencil />
                {t("gigs.edit.button")}
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Pencil />
              {t("gigs.edit.button")}
            </Button>
          ))}
        {gig.data && (
          <GigActions
            bandSlug={bandSlug}
            gig={gig.data}
            onDeleted={() => navigate({ to: "/b/$bandSlug/gigs", params: { bandSlug } })}
          />
        )}
      </div>
      {gig.isPending ? (
        <ListSkeleton rows={3} />
      ) : gig.data === undefined || replacesData(gig.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, gig.error)}
        </p>
      ) : (
        <GigView bandSlug={bandSlug} gig={gig.data} />
      )}
    </section>
  );
}

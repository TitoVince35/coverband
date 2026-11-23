import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { VenueEditor } from "@/components/gigs/venue-editor";
import { Button } from "@/components/ui/button";

// A new venue (#334), from the venues page.
export const Route = createFileRoute("/_app/b/$bandSlug/venues/new")({
  component: NewVenuePage,
});

function NewVenuePage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-heading font-semibold text-xl">{t("gigs.venue.newButton")}</h2>
        <Button asChild variant="ghost" size="icon">
          <Link to="/b/$bandSlug/venues" params={{ bandSlug }} aria-label={t("common.close")}>
            <X />
          </Link>
        </Button>
      </div>
      <VenueEditor bandSlug={bandSlug} />
    </section>
  );
}

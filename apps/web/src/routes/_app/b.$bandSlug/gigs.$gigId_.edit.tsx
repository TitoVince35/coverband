import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGigRights } from "@/components/gigs/gig-actions";
import { GigForm } from "@/components/gigs/gig-form";
import { ListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { errorMessage, replacesData } from "@/lib/errors";
import { gigQuery } from "@/lib/gigs";

// Editing a gig (brief 034): its form, a page of its own, outside the compact view's page.
export const Route = createFileRoute("/_app/b/$bandSlug/gigs/$gigId_/edit")({
  // After Postpone, the form starts on the date.
  validateSearch: (search: Record<string, unknown>): { focus?: "date" } =>
    search.focus === "date" ? { focus: "date" as const } : {},
  component: EditGigPage,
});

function EditGigPage() {
  const { t } = useTranslation();
  const { bandSlug, gigId } = Route.useParams();
  const { focus } = Route.useSearch();
  const gig = useQuery(gigQuery(bandSlug, gigId));
  const rights = useGigRights(
    bandSlug,
    gig.data ?? { status: "proposed", date: "9999-12-31", createdById: null },
  );
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-heading font-semibold text-xl">{t("gigs.edit.title")}</h2>
        <Button asChild variant="ghost" size="icon">
          <Link
            to="/b/$bandSlug/gigs/$gigId"
            params={{ bandSlug, gigId }}
            aria-label={t("common.close")}
          >
            <X />
          </Link>
        </Button>
      </div>
      {gig.isPending ? (
        <ListSkeleton rows={4} />
      ) : gig.data === undefined || replacesData(gig.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, gig.error)}
        </p>
      ) : !rights.edit ? (
        // Cancelled, or its day is over: read-only.
        <p role="alert" className="text-muted-foreground text-sm">
          {gig.data.status === "cancelled" ? t("errors.gig_cancelled") : t("errors.gig_past")}
        </p>
      ) : (
        // Saved since: a fresh form on the new version.
        <GigForm key={gig.data.version} bandSlug={bandSlug} gig={gig.data} focus={focus} />
      )}
    </section>
  );
}

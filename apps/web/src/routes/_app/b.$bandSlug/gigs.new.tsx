import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GigForm } from "@/components/gigs/gig-form";
import { Button } from "@/components/ui/button";

// A new gig (brief 034): its form, a page of its own.
export const Route = createFileRoute("/_app/b/$bandSlug/gigs/new")({
  component: NewGigPage,
});

function NewGigPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-heading font-semibold text-xl">{t("gigs.new.title")}</h2>
        <Button asChild variant="ghost" size="icon">
          <Link to="/b/$bandSlug/gigs" params={{ bandSlug }} aria-label={t("common.close")}>
            <X />
          </Link>
        </Button>
      </div>
      <GigForm bandSlug={bandSlug} />
    </section>
  );
}

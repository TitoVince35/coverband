import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/** Links to the band's venues and contacts pages (#334); the Gigs tab leads back to the gigs. */
export function GigPagesNav({ bandSlug }: { bandSlug: string }) {
  const { t } = useTranslation();
  const link =
    "flex min-h-8 items-center text-primary text-sm underline-offset-4 hover:underline data-[status=active]:font-semibold data-[status=active]:text-foreground data-[status=active]:no-underline";
  return (
    <nav aria-label={t("gigs.venues.pages")} className="flex flex-wrap gap-x-4">
      <Link to="/b/$bandSlug/venues" params={{ bandSlug }} className={link}>
        {t("gigs.venues.title")}
      </Link>
      <Link to="/b/$bandSlug/contacts" params={{ bandSlug }} className={link}>
        {t("gigs.contacts.pageTitle")}
      </Link>
    </nav>
  );
}

import { instrumentsLabel } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/i18n/use-language";
import { bandQuery } from "@/lib/bands";

// Band home page. Repertoire, setlists and gigs come later.
export const Route = createFileRoute("/_app/b/$bandSlug/")({
  component: BandHome,
});

function BandHome() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { bandSlug } = Route.useParams();
  const { data } = useQuery(bandQuery(bandSlug));
  if (!data) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="font-heading font-semibold text-lg">
        {t("band.welcome", { band: data.band.name })}
      </h2>
      <p>
        {t("band.you", {
          details: [
            t(`band.roles.${data.membership.role}`),
            instrumentsLabel(data.membership.instruments, language),
          ]
            .filter(Boolean)
            .join(" · "),
        })}
      </p>
      <p className="text-muted-foreground text-sm">{t("band.comingSoon")}</p>
    </section>
  );
}

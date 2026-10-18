import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BandJournal } from "@/components/band/band-journal";
import { bandQuery } from "@/lib/bands";

// Band home page: the welcome, the band's journal (#84), then what's coming (repertoire,
// setlists and gigs come later).
export const Route = createFileRoute("/_app/b/$bandSlug/")({
  component: BandHome,
});

function BandHome() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const { data } = useQuery(bandQuery(bandSlug));
  if (!data) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="font-heading font-semibold text-lg">
        {t("band.welcome", { band: data.band.name })}
      </h2>
      <BandJournal bandSlug={bandSlug} />
      <p className="text-muted-foreground text-sm">{t("band.comingSoon")}</p>
    </section>
  );
}

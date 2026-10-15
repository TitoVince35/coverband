import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { bandQuery } from "@/lib/bands";
import { ApiRequestError, errorMessage } from "@/lib/errors";

// Band home page. Lineup (#7), repertoire, setlists and gigs come later.
export const Route = createFileRoute("/_app/b/$bandSlug")({
  component: BandPage,
});

function BandPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const query = useQuery(bandQuery(bandSlug));

  if (query.isPending) {
    return null;
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiRequestError && query.error.code === "not_found";
    return (
      <p role="alert" className="text-muted-foreground">
        {notFound ? t("band.notFound") : errorMessage(t, query.error)}
      </p>
    );
  }

  const { band, membership } = query.data;
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl tracking-tight">
          {t("band.welcome", { band: band.name })}
        </h1>
        {band.genre && <p className="text-muted-foreground">{band.genre}</p>}
      </div>
      <p>
        {t("band.you", {
          role: t(`band.roles.${membership.role}`),
          instrument: membership.instrument,
        })}
      </p>
      <p className="text-muted-foreground text-sm">{t("band.comingSoon")}</p>
    </section>
  );
}

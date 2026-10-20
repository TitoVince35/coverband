import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InstallCard } from "@/components/install-card";
import { InstrumentTags } from "@/components/instruments/instrument-tags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { myBandsQuery } from "@/lib/bands";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const bands = useQuery(myBandsQuery);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl tracking-tight">{t("home.title")}</h1>
        <p className="text-muted-foreground">{t("home.greeting", { name: user.name })}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t("home.yourBands")}</CardTitle>
        </CardHeader>
        <CardContent>
          {bands.isPending ? null : bands.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, bands.error)}
            </p>
          ) : bands.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("home.noBands")}</p>
          ) : (
            <ul className="-mx-2">
              {bands.data.map((band) => (
                <li key={band.slug}>
                  <Link
                    to="/b/$bandSlug"
                    params={{ bandSlug: band.slug }}
                    className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{band.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="inline-block text-muted-foreground text-xs first-letter:uppercase">
                          {t(`band.roles.${band.role}`)}
                        </span>
                        <InstrumentTags instruments={band.instruments} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <InstallCard />
    </section>
  );
}

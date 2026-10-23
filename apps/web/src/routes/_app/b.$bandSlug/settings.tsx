import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BandDetailsForm } from "@/components/band/band-details-form";
import { BandLogoField } from "@/components/band/band-logo-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bandQuery } from "@/lib/bands";

// The band's settings (#221): its genre and logo, for the band leader only; the band menu shows
// the page disabled to musicians, and one opening its URL goes back to the band's home.
export const Route = createFileRoute("/_app/b/$bandSlug/settings")({
  component: BandSettingsPage,
});

function BandSettingsPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  // The band layout has loaded it already.
  const { data } = useQuery(bandQuery(bandSlug));
  if (!data) return null;
  if (data.membership.role !== "leader") {
    return <Navigate to="/b/$bandSlug" params={{ bandSlug }} replace />;
  }

  return (
    <section className="space-y-6">
      <h2 className="font-heading font-semibold text-lg">{t("band.settings")}</h2>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t("band.edit.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Keyed: another band's page starts from its own genre. */}
          <BandDetailsForm key={data.band.slug} band={data.band} />
        </CardContent>
      </Card>
      {/* Out of a card: the logo shows as wide as on the band's home page. */}
      <BandLogoField bandSlug={data.band.slug} logo={data.band.logo} />
    </section>
  );
}

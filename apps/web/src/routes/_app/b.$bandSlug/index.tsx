import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ImagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BandJournal } from "@/components/band/band-journal";
import { BandLogo } from "@/components/band/band-logo";
import { bandQuery } from "@/lib/bands";

// Band home page: the band's logo (#177; without one, the band leader's way to add it, #222), the
// band's journal (#84), then what's coming (setlists and gigs come later).
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
      {data.band.logo ? (
        <BandLogo band={data.band} size="large" />
      ) : (
        data.membership.role === "leader" && (
          // Never the app's logo: it would look like the band's. Musicians see nothing.
          <Link
            to="/b/$bandSlug/settings"
            params={{ bandSlug }}
            className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground text-sm outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImagePlus aria-hidden className="size-8" />
            {t("band.logo.add")}
          </Link>
        )
      )}
      <BandJournal bandSlug={bandSlug} />
      <p className="text-muted-foreground text-sm">{t("band.comingSoon")}</p>
    </section>
  );
}

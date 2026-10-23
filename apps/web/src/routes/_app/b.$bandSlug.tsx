import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BandLogo } from "@/components/band/band-logo";
import { BandNav } from "@/components/band/band-nav";
import { BandSwitcher } from "@/components/band/band-switcher";
import { BandSkeleton } from "@/components/loading";
import { bandQuery } from "@/lib/bands";
import { ApiRequestError, errorMessage } from "@/lib/errors";

// Layout of every band page: band name (opening the band menu: settings, other bands) and the
// band's sections (tabs, or a bottom bar on a phone).
export const Route = createFileRoute("/_app/b/$bandSlug")({
  component: BandLayout,
});

function BandLayout() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const query = useQuery(bandQuery(bandSlug));

  if (query.isPending) {
    return <BandSkeleton />;
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
    // On a phone, room for the bottom bar.
    <div className="space-y-6 pb-16 sm:pb-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <BandSwitcher current={band} isLeader={membership.role === "leader"} />
          {band.genre && <p className="text-muted-foreground">{band.genre}</p>}
        </div>
        {/* The small logo on the right, as tall as the name and genre; nothing without one. */}
        <BandLogo band={band} size="header" />
      </div>
      <BandNav bandSlug={bandSlug} />
      <Outlet />
    </div>
  );
}

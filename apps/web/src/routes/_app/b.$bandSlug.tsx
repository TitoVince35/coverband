import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BandSwitcher } from "@/components/band/band-switcher";
import { EditBandDialog } from "@/components/band/edit-band-dialog";
import { bandQuery } from "@/lib/bands";
import { ApiRequestError, errorMessage } from "@/lib/errors";

// Layout of every band page: band name (with the switcher), leader tools and tabs.
export const Route = createFileRoute("/_app/b/$bandSlug")({
  component: BandLayout,
});

// TanStack Router marks the current tab with data-status="active".
const tab =
  "border-b-2 border-transparent px-1 pb-2 text-muted-foreground text-sm hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground";

function BandLayout() {
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
    <div className="space-y-6">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <BandSwitcher current={band} />
          {band.genre && <p className="text-muted-foreground">{band.genre}</p>}
        </div>
        {membership.role === "leader" && <EditBandDialog band={band} />}
      </div>
      <nav className="flex gap-4 border-b">
        <Link
          to="/b/$bandSlug"
          params={{ bandSlug }}
          activeOptions={{ exact: true }}
          className={tab}
        >
          {t("band.home")}
        </Link>
        <Link to="/b/$bandSlug/lineup" params={{ bandSlug }} className={tab}>
          {t("lineup.title")}
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

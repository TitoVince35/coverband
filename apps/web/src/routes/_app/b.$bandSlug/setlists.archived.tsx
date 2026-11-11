import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
import { SetlistList, SetlistTabs } from "@/components/setlists/setlist-list";
import { errorMessage, replacesData } from "@/lib/errors";
import { archivedSetlistsQuery } from "@/lib/setlists";

// The band's archived setlists (#271): read-only, not counted in the band's limit; restored from
// their menu.
export const Route = createFileRoute("/_app/b/$bandSlug/setlists/archived")({
  component: ArchivedSetlistsPage,
});

function ArchivedSetlistsPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const setlists = useQuery(archivedSetlistsQuery(bandSlug));

  return (
    <section className="space-y-4">
      <h2 className="font-heading font-semibold text-lg">{t("setlists.title")}</h2>
      <SetlistTabs bandSlug={bandSlug} current="archived" archived={setlists.data?.length} />
      <p className="text-muted-foreground text-sm">{t("setlists.archive.hint")}</p>
      {setlists.isPending ? (
        <ListSkeleton rows={3} />
      ) : setlists.data === undefined || replacesData(setlists.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, setlists.error)}
        </p>
      ) : setlists.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("setlists.archive.empty")}</p>
      ) : (
        <SetlistList bandSlug={bandSlug} setlists={setlists.data} />
      )}
    </section>
  );
}

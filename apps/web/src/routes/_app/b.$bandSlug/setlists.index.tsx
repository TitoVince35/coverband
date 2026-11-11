import { SETLIST_LIMITS } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
import { SetlistList, SetlistTabs } from "@/components/setlists/setlist-list";
import { SetlistTitleDialog } from "@/components/setlists/setlist-title-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage, replacesData } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { archivedSetlistsQuery, setlistsQuery } from "@/lib/setlists";

// The band's setlists (brief 026, #271): the current ones, the latest changed first; any member
// creates one, which then opens.
export const Route = createFileRoute("/_app/b/$bandSlug/setlists/")({
  component: SetlistsPage,
});

function SetlistsPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const setlists = useQuery(setlistsQuery(bandSlug));
  const archived = useQuery(archivedSetlistsQuery(bandSlug)).data?.length;
  const full = (setlists.data?.length ?? 0) >= SETLIST_LIMITS.perBand;
  // Offline, the app is read-only (#165, #274).
  const online = useOnline();

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="flex-1 font-heading font-semibold text-lg">{t("setlists.title")}</h2>
        <SetlistTitleDialog
          bandSlug={bandSlug}
          trigger={
            <Button disabled={full || !online}>
              <Plus />
              {t("setlists.new.button")}
            </Button>
          }
        />
      </div>
      <SetlistTabs bandSlug={bandSlug} current="current" archived={archived} />
      {setlists.isPending ? (
        <ListSkeleton rows={4} />
      ) : setlists.data === undefined || replacesData(setlists.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, setlists.error)}
        </p>
      ) : setlists.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("setlists.empty")}</p>
      ) : (
        <>
          <SetlistList bandSlug={bandSlug} setlists={setlists.data} />
          <p className="text-center text-muted-foreground text-xs">
            {full
              ? t("setlists.full", { max: SETLIST_LIMITS.perBand })
              : t("setlists.count", { count: setlists.data.length, max: SETLIST_LIMITS.perBand })}
          </p>
        </>
      )}
    </section>
  );
}

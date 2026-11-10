import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/loading";
import { SetlistEditor } from "@/components/setlists/setlist-editor";
import { SetlistMenu } from "@/components/setlists/setlist-menu";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { setlistQuery, setSetlistArchived } from "@/lib/setlists";

// One setlist (brief 026): its title, its author and its actions, then its parts and songs in the
// editor (#272); an archived one is read-only.
export const Route = createFileRoute("/_app/b/$bandSlug/setlists/$setlistId")({
  component: SetlistPage,
});

function SetlistPage() {
  const { t } = useTranslation();
  const { bandSlug, setlistId } = Route.useParams();
  const setlist = useQuery(setlistQuery(bandSlug, setlistId));

  return (
    <section className="space-y-4">
      <Link
        to="/b/$bandSlug/setlists"
        params={{ bandSlug }}
        className="-ml-1 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t("setlists.back")}
      </Link>
      {setlist.isPending ? (
        <ListSkeleton rows={4} />
      ) : setlist.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, setlist.error)}
        </p>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="break-words font-heading font-semibold text-xl">
                {setlist.data.title}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("setlists.by", { name: setlist.data.createdBy ?? t("journal.someone") })}
              </p>
            </div>
            <SetlistMenu bandSlug={bandSlug} setlist={setlist.data} />
          </div>
          {setlist.data.archivedAt && (
            <ArchivedSetlistBanner bandSlug={bandSlug} setlistId={setlistId} />
          )}
          <SetlistEditor key={setlistId} bandSlug={bandSlug} setlist={setlist.data} />
        </>
      )}
    </section>
  );
}

/** Shown on an archived setlist: it's read-only, and a tap brings it back. */
function ArchivedSetlistBanner({ bandSlug, setlistId }: { bandSlug: string; setlistId: string }) {
  const { t } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  const restore = useMutation({
    networkMode: "always",
    mutationFn: () => setSetlistArchived(bandSlug, setlistId, false),
    onSuccess: async () => {
      toast.success(t("setlists.archive.restored"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
  });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm">
      <Archive className="size-4 shrink-0 text-muted-foreground" />
      <p role="status" className="flex-1">
        {t("setlists.archive.banner")}
      </p>
      <Button
        size="sm"
        disabled={!online}
        pending={restore.isPending}
        onClick={() => restore.mutate()}
      >
        <ArchiveRestore />
        {t("setlists.archive.restore")}
      </Button>
      {restore.isError && (
        <p role="alert" className="w-full text-destructive">
          {errorMessage(t, restore.error)}
        </p>
      )}
    </div>
  );
}

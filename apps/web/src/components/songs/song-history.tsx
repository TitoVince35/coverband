import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { JournalList } from "@/components/band/band-journal";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListSkeleton } from "@/components/loading";
import { errorMessage, replacesData } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { songHistoryQuery } from "@/lib/songs";

/**
 * A song's history (#286): its latest events (its documents' included), told like the band's
 * journal, in a closed accordion; loaded with the song page, kept offline.
 */
export function SongHistory({ bandSlug, songId }: { bandSlug: string; songId: string }) {
  const { t } = useTranslation();
  return (
    <CollapsibleCard title={t("songs.history")} defaultOpen={false}>
      <HistoryEntries bandSlug={bandSlug} songId={songId} />
    </CollapsibleCard>
  );
}

function HistoryEntries({ bandSlug, songId }: { bandSlug: string; songId: string }) {
  const { t } = useTranslation();
  const history = useQuery(songHistoryQuery(bandSlug, songId));
  const online = useOnline();
  // Offline, a history never loaded on this device won't come: say so rather than wait.
  if (history.isPending && !online) {
    return <p className="text-muted-foreground text-sm">{t("songs.historyOffline")}</p>;
  }
  if (history.isPending) return <ListSkeleton rows={3} />;
  if (history.data === undefined || replacesData(history.error)) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {errorMessage(t, history.error)}
      </p>
    );
  }
  return <JournalList bandSlug={bandSlug} entries={history.data} label={t("songs.history")} />;
}

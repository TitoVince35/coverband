import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/errors";
import { archivedSongsQuery } from "@/lib/songs";

// The band's archived songs (#91): out of the repertoire; each song's page restores it.
export const Route = createFileRoute("/_app/b/$bandSlug/songs/archived")({
  component: ArchivedSongsPage,
});

function ArchivedSongsPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const songs = useQuery(archivedSongsQuery(bandSlug));

  return (
    <section className="space-y-4">
      <Link
        to="/b/$bandSlug/songs"
        params={{ bandSlug }}
        className="-ml-1 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t("songs.back")}
      </Link>
      <h2 className="font-heading font-semibold text-lg">{t("songs.archive.list")}</h2>
      {songs.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : songs.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, songs.error)}
        </p>
      ) : songs.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("songs.archive.empty")}</p>
      ) : (
        <Card className="py-2">
          <CardContent className="px-2">
            <ul className="divide-y" aria-label={t("songs.archive.list")}>
              {songs.data.map((song) => (
                <li key={song.id}>
                  <Link
                    to="/b/$bandSlug/songs/$songId"
                    params={{ bandSlug, songId: song.id }}
                    className="block rounded-lg px-3 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="truncate font-medium">{song.title}</p>
                    <p className="truncate text-muted-foreground text-sm">{song.artist}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

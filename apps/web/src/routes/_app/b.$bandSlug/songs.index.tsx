import { formatDuration, normalizeName } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SongFormDialog } from "@/components/songs/song-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { playedDuration, songsQuery } from "@/lib/songs";

// The band's repertoire (#88): every song, by title, searchable; any member adds songs.
export const Route = createFileRoute("/_app/b/$bandSlug/songs/")({
  component: RepertoirePage,
});

function RepertoirePage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const songs = useQuery(songsQuery(bandSlug));
  const [query, setQuery] = useState("");
  const words = normalizeName(query);
  const shown =
    songs.data?.filter((song) => normalizeName(`${song.title} ${song.artist}`).includes(words)) ??
    [];

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="flex-1 font-heading font-semibold text-lg">{t("songs.title")}</h2>
        <SongFormDialog
          bandSlug={bandSlug}
          tooltip={t("songs.add")}
          trigger={
            <Button size="icon-lg" className="size-12 rounded-full" aria-label={t("songs.add")}>
              <Plus className="size-6" />
            </Button>
          }
        />
      </div>
      {songs.isPending ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : songs.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, songs.error)}
        </p>
      ) : songs.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("songs.empty")}</p>
      ) : (
        <>
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t("songs.search")}
              placeholder={t("songs.search")}
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("songs.noMatch", { query })}</p>
          ) : (
            <Card className="py-2">
              <CardContent className="px-2">
                <ul className="divide-y" aria-label={t("songs.title")}>
                  {shown.map((song) => {
                    const duration = playedDuration(song);
                    return (
                      <li key={song.id}>
                        <Link
                          to="/b/$bandSlug/songs/$songId"
                          params={{ bandSlug, songId: song.id }}
                          className="flex items-center gap-3 rounded-lg px-3 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{song.title}</p>
                            <p className="truncate text-muted-foreground text-sm">{song.artist}</p>
                          </div>
                          {duration !== null && (
                            <span className="text-muted-foreground text-sm tabular-nums">
                              {formatDuration(duration)}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}

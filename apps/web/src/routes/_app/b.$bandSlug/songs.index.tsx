import { formatDuration, keyShort, SONG_STATUSES, type SongStatus } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SongFormDialog } from "@/components/songs/song-form-dialog";
import { EnergyPeppers, SongStatusBadge } from "@/components/songs/song-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/errors";
import { type RepertoireSort, repertoireView } from "@/lib/repertoire";
import { playedDuration, songsQuery } from "@/lib/songs";
import { cn } from "@/lib/utils";

// The band's repertoire (#88): every song, searchable, filtered on its status and sorted by title
// or energy (#90); any member adds songs.
export const Route = createFileRoute("/_app/b/$bandSlug/songs/")({
  component: RepertoirePage,
});

function RepertoirePage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const songs = useQuery(songsQuery(bandSlug));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SongStatus | "all">("all");
  const [sort, setSort] = useState<RepertoireSort>("title");
  const shown = repertoireView(songs.data ?? [], { query, status, sort });
  const count = (s: SongStatus | "all") =>
    songs.data?.filter((song) => s === "all" || song.status === s).length ?? 0;

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
          <div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex flex-1 flex-wrap gap-2">
              <legend className="sr-only">{t("songs.filter")}</legend>
              {(["all", ...SONG_STATUSES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-4xl border px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`songs.status.${s}`)}{" "}
                  <span className="tabular-nums opacity-70">{count(s)}</span>
                </button>
              ))}
            </fieldset>
            <Select value={sort} onValueChange={(value) => setSort(value as RepertoireSort)}>
              <SelectTrigger size="sm" aria-label={t("songs.sort.label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="title">{t("songs.sort.title")}</SelectItem>
                <SelectItem value="energy">{t("songs.sort.energy")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {shown.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {query
                ? t("songs.noMatch", { query })
                : t("songs.noneWithStatus", { status: t(`songs.status.${status}`) })}
            </p>
          ) : (
            <Card className="py-2">
              <CardContent className="px-2">
                <ul className="divide-y" aria-label={t("songs.title")}>
                  {shown.map((song) => {
                    const duration = playedDuration(song);
                    // The key it's played in, and the tempo.
                    const key = song.bandKey ?? song.key;
                    const extra = [
                      key && keyShort(key),
                      song.tempo && t("songs.bpm", { tempo: song.tempo }),
                    ].filter(Boolean);
                    return (
                      <li key={song.id}>
                        <Link
                          to="/b/$bandSlug/songs/$songId"
                          params={{ bandSlug, songId: song.id }}
                          className="flex items-center gap-3 rounded-lg px-3 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">{song.title}</p>
                              <SongStatusBadge status={song.status} />
                              <EnergyPeppers energy={song.energy} className="text-xs" />
                            </div>
                            <p className="truncate text-muted-foreground text-sm">{song.artist}</p>
                          </div>
                          <div className="shrink-0 text-right text-muted-foreground text-sm tabular-nums">
                            {duration !== null && <p>{formatDuration(duration)}</p>}
                            {extra.length > 0 && <p className="text-xs">{extra.join(" · ")}</p>}
                          </div>
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

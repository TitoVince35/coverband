import { formatDuration, keyShort, type SongStatus } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
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
import { archivedSongsQuery, playedDuration, songsQuery } from "@/lib/songs";
import { cn } from "@/lib/utils";

// The band's repertoire (#88): every song, searchable, filtered on its status and sorted by title
// or energy (#90); any member adds songs.
/** The status filters, the songs ready to play first (the song page picks them in order). */
const STATUS_FILTERS = ["all", "ready", "learning", "proposed"] as const satisfies readonly (
  | SongStatus
  | "all"
)[];

export const Route = createFileRoute("/_app/b/$bandSlug/songs/")({
  component: RepertoirePage,
});

function RepertoirePage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const songs = useQuery(songsQuery(bandSlug));
  const archived = useQuery(archivedSongsQuery(bandSlug)).data?.length ?? 0;
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
        <ListSkeleton rows={5} />
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
          {/* The status filters on one line (scrolling sideways if a phone is too narrow), the sort
              on its own line below. */}
          <div className="space-y-2">
            <fieldset className="-m-1 flex gap-2 overflow-x-auto p-1">
              <legend className="sr-only">{t("songs.filter")}</legend>
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-4xl border px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
            <div className="flex justify-end">
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
                    // How long the band plays it, the key it's played in, and the tempo.
                    const key = song.bandKey ?? song.key;
                    const extra = [
                      duration !== null && formatDuration(duration),
                      key && keyShort(key),
                      song.tempo && t("songs.bpm", { tempo: song.tempo }),
                    ].filter(Boolean);
                    return (
                      <li key={song.id}>
                        <Link
                          to="/b/$bandSlug/songs/$songId"
                          params={{ bandSlug, songId: song.id }}
                          className="block space-y-0.5 rounded-lg px-3 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {/* A long title wraps onto a second line rather than being cut. */}
                          <div className="flex items-start gap-3">
                            <p className="line-clamp-2 min-w-0 flex-1 break-words font-medium">
                              {song.title}
                            </p>
                            <div className="shrink-0">
                              <SongStatusBadge status={song.status} />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground text-sm">
                            <p className="min-w-0 flex-1 truncate">{song.artist}</p>
                            {(extra.length > 0 || song.energy) && (
                              <p className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                                {extra.length > 0 && <span>{extra.join(" · ")}</span>}
                                <EnergyPeppers energy={song.energy} />
                              </p>
                            )}
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
      {archived > 0 && (
        <Link
          to="/b/$bandSlug/songs/archived"
          params={{ bandSlug }}
          className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        >
          <Archive className="size-4" />
          {t("songs.archive.list")} <span className="tabular-nums">({archived})</span>
        </Link>
      )}
    </section>
  );
}

import { formatDuration } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type TrackMatch, trackSearchQuery } from "@/lib/autofill-search";
import { errorMessage } from "@/lib/errors";

/** A free search's longest text, as the API accepts it (`TRACK_SEARCH_MAX`). */
const TEXT_MAX = 200;

/**
 * A link searched on Deezer (#220), inside the link form: the song's title and artist searched at
 * once, refined as free text, up to five tracks; choosing one fills the form in.
 */
export function LinkSearch({
  bandSlug,
  song,
  onChoose,
  onBack,
}: {
  bandSlug: string;
  song: { title: string; artist: string };
  onChoose: (track: TrackMatch) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const songText = `${song.title} ${song.artist}`.slice(0, TEXT_MAX);
  const [draft, setDraft] = useState(songText);
  const [text, setText] = useState(songText);
  const search = useQuery(trackSearchQuery(bandSlug, text));

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = draft.trim();
    if (!typed) return;
    // The same search again (a retry after an error): asked again.
    if (typed === text) void search.refetch();
    else setText(typed);
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading">{t("songs.media.search.title")}</DialogTitle>
        <DialogDescription>{t("songs.media.search.description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSearch} className="flex gap-2">
        <Input
          aria-label={t("songs.media.search.refine")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={TEXT_MAX}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={t("songs.media.search.again")}
          disabled={search.isFetching}
        >
          <Search />
        </Button>
      </form>
      {search.isPending ? (
        <div role="status" className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Loader2 aria-hidden className="size-8 animate-spin" />
          {t("songs.media.search.searching")}
        </div>
      ) : search.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, search.error)}
        </p>
      ) : search.data.length === 0 ? (
        <p className="text-sm">{t("songs.media.search.none")}</p>
      ) : (
        <ul className="-mx-2 divide-y" aria-label={t("songs.media.search.matches")}>
          {search.data.map((track) => (
            <li key={track.url}>
              <button
                type="button"
                onClick={() => onChoose(track)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{track.title}</p>
                  <p className="truncate text-sm">{track.artist}</p>
                  <p className="truncate text-muted-foreground text-xs tabular-nums">
                    {[track.album, track.duration !== null && formatDuration(track.duration)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" onClick={onBack}>
        <ChevronLeft />
        {t("songs.media.search.back")}
      </Button>
    </div>
  );
}

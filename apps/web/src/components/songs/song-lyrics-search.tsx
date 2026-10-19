import { formatDuration } from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Globe, Loader2, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { type LyricsMatch, lyricsSearchQuery, updateSong } from "@/lib/songs";

/** What a lyrics search looks for. */
export type Song = { title: string; artist: string };

type Props = {
  bandSlug: string;
  songId: string;
  song: Song;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nothing found, or the service down: type them in instead. */
  onTypeIn: () => void;
};

/**
 * Lyrics searched online (#130): a spinner, then up to five matches; one is previewed and only
 * saved with "Use these lyrics". Credited to LRCLIB.
 */
export function LyricsSearchDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SearchContent {...props} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

/**
 * Opens a web search for the song's lyrics in a new tab (#136), on the member's own device: they
 * copy the lyrics and paste them in. Nothing goes through our server.
 */
export function WebSearchButton({ song }: { song: Song }) {
  const { t } = useTranslation();
  // The title is quoted in the query: its own quotes would break the phrase.
  const query = t("songs.lyrics.web.query", { ...song, title: song.title.replaceAll('"', "") });
  return (
    <Button variant="outline" asChild>
      <a
        href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Globe />
        {t("songs.lyrics.web.button")}
      </a>
    </Button>
  );
}

function SearchContent({
  bandSlug,
  songId,
  song,
  onTypeIn,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The song's title and artist first; edited, a free search (#138: "Take Five Carmen McRae").
  const songText = `${song.title} ${song.artist}`;
  const [draft, setDraft] = useState(songText);
  const [text, setText] = useState<string | undefined>();
  const search = useQuery(lyricsSearchQuery(bandSlug, songId, text));
  const [chosen, setChosen] = useState<LyricsMatch | null>(null);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = draft.trim();
    setText(typed && typed !== songText ? typed : undefined);
    setChosen(null);
  }

  const use = useMutation({
    mutationFn: (match: LyricsMatch) =>
      updateSong(bandSlug, songId, { lyrics: match.lyrics, lyricsSource: "lrclib" }),
    onSuccess: async () => {
      // The song first: the block shows the new lyrics as the modal closes.
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      toast.success(t("songs.lyrics.saved"));
      onClose();
    },
  });

  // Nothing to choose from: find them on the web, or type them in.
  const elsewhere = (
    <div className="flex flex-wrap justify-end gap-2">
      <WebSearchButton song={song} />
      <Button variant="outline" onClick={onTypeIn}>
        {t("songs.lyrics.typeIn")}
      </Button>
    </div>
  );

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-heading">{t("songs.lyrics.search.title")}</DialogTitle>
        <DialogDescription>{t("songs.lyrics.search.description")}</DialogDescription>
        {!chosen && (
          <form onSubmit={onSearch} className="flex gap-2 pt-2">
            <Input
              aria-label={t("songs.lyrics.search.refine")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={200}
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              aria-label={t("songs.lyrics.search.again")}
              disabled={search.isFetching}
            >
              <Search />
            </Button>
          </form>
        )}
      </DialogHeader>
      {search.isPending ? (
        <div role="status" className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <Loader2 aria-hidden className="size-8 animate-spin" />
          {t("songs.lyrics.search.searching")}
        </div>
      ) : search.isError ? (
        <div className="space-y-4">
          <p role="alert" className="text-destructive">
            {errorMessage(t, search.error)}
          </p>
          {elsewhere}
        </div>
      ) : search.data.matches.length === 0 ? (
        <div className="space-y-4">
          <p>
            {search.data.instrumental
              ? t("songs.lyrics.search.instrumental")
              : t("songs.lyrics.search.none")}
          </p>
          {elsewhere}
        </div>
      ) : chosen ? (
        <>
          <div className="min-h-0 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3">
            {chosen.lyrics}
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{t("songs.lyrics.credit")}</p>
            {use.isError && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(t, use.error)}
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setChosen(null)}>
                <ChevronLeft />
                {t("songs.lyrics.search.back")}
              </Button>
              <Button disabled={use.isPending} onClick={() => use.mutate(chosen)}>
                {use.isPending ? t("common.saving") : t("songs.lyrics.search.use")}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <ul
          className="-mx-2 min-h-0 divide-y overflow-y-auto"
          aria-label={t("songs.lyrics.search.matches")}
        >
          {search.data.matches.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => setChosen(match)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{firstLine(match.lyrics)}</p>
                  {/* A free search can bring other songs: whose these lyrics are. */}
                  <p className="truncate text-sm">
                    {match.artist} – {match.title}
                  </p>
                  <p className="truncate text-muted-foreground text-xs tabular-nums">
                    {[
                      match.album ?? t("songs.lyrics.search.noAlbum"),
                      match.duration !== null && formatDuration(match.duration),
                    ]
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
    </DialogContent>
  );
}

// Matches come trimmed: their first line is never blank.
const firstLine = (lyrics: string) => lyrics.split("\n", 1)[0];

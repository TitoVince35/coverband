import { keyShort } from "@coverband/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MicVocal, XIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BandLogo } from "@/components/band/band-logo";
import { ListSkeleton } from "@/components/loading";
import { songsDuration } from "@/components/setlists/setlist-duration";
import { LyricsView } from "@/components/songs/lyrics-view";
import { Button } from "@/components/ui/button";
import { bandQuery } from "@/lib/bands";
import { errorMessage, replacesData } from "@/lib/errors";
import { playingOrder, useLeaveFullscreenOnClose } from "@/lib/live";
import { useWakeLock } from "@/lib/lyrics-view";
import { type Setlist, setlistQuery } from "@/lib/setlists";
import { songQuery } from "@/lib/songs";
import { cn } from "@/lib/utils";

type LiveSong = Setlist["parts"][number]["songs"][number];

/**
 * A setlist live (brief 031, #307): read-only, offline (from what the phone keeps), over the
 * whole app with the screen kept awake. A compact header that scrolls away, then each part and
 * its songs; an exit button always in reach.
 */
export function LiveSetlist({ bandSlug, setlistId }: { bandSlug: string; setlistId: string }) {
  const { t } = useTranslation();
  const setlist = useQuery(setlistQuery(bandSlug, setlistId));
  const band = useQuery(bandQuery(bandSlug));
  useWakeLock(true);
  useLeaveFullscreenOnClose();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={setlist.data?.title ?? t("setlists.live.button")}
      className="fixed inset-0 z-50 overflow-y-auto bg-background px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]"
    >
      <Link
        to="/b/$bandSlug/setlists/$setlistId"
        params={{ bandSlug, setlistId }}
        replace
        aria-label={t("setlists.live.exit")}
        className="fixed top-[calc(0.5rem+env(safe-area-inset-top))] right-2 z-10 flex size-11 items-center justify-center rounded-full border bg-background/90 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon className="size-5" />
      </Link>
      {setlist.isPending ? (
        <ListSkeleton rows={6} />
      ) : setlist.data === undefined || replacesData(setlist.error) ? (
        <p role="alert" className="pr-12 text-destructive">
          {errorMessage(t, setlist.error)}
        </p>
      ) : (
        <LiveContent bandSlug={bandSlug} setlist={setlist.data} band={band.data?.band} />
      )}
    </div>
  );
}

function LiveContent({
  bandSlug,
  setlist,
  band,
}: {
  bandSlug: string;
  setlist: Setlist;
  band: Parameters<typeof BandLogo>[0]["band"] | undefined;
}) {
  const { t } = useTranslation();
  const songs = setlist.parts.flatMap((part) => part.songs);
  // Each song's details (its notes), as the phone keeps them for offline use.
  const details = useQueries({
    queries: [...new Set(songs.map((song) => song.id))].map((id) => songQuery(bandSlug, id)),
  });
  const detailsOf = new Map(
    details.flatMap((query) => (query.data ? [[query.data.id, query.data] as const] : [])),
  );
  const order = playingOrder(setlist.parts);
  // The song whose lyrics show, by its place in the playing order (#308).
  const [lyricsAt, setLyricsAt] = useState<number | null>(null);
  const shown = lyricsAt === null ? null : order[lyricsAt];
  // Where each part starts in the playing order.
  const starts = setlist.parts.map((_, p) => order.findIndex((place) => place.part === p));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3 pr-12">
        {band && <BandLogo band={band} size="header" />}
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-bold font-heading text-2xl leading-tight">
            {setlist.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {[
              band?.name,
              t("setlists.songCount", { count: songs.length }),
              songs.length > 0 && songsDuration(t, songs),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>
      {setlist.parts.map((part, p) => {
        const name = part.name ?? t("setlists.part.default", { n: p + 1 });
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: read-only, parts never move here.
          <section key={p} aria-label={name} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 border-b pb-1">
              <h2 className="font-bold font-heading text-xl">{name}</h2>
              {part.songs.length > 0 && (
                <span className="shrink-0 text-muted-foreground text-sm">
                  {songsDuration(t, part.songs)}
                </span>
              )}
            </div>
            <ol className="divide-y">
              {part.songs.map((song, i) => (
                <LiveSongRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: read-only; a song may be played twice.
                  key={`${song.id}-${i}`}
                  index={i + 1}
                  song={song}
                  notes={detailsOf.get(song.id)?.notes ?? null}
                  hasLyrics={Boolean(detailsOf.get(song.id)?.lyrics)}
                  onLyrics={() => setLyricsAt((starts[p] ?? 0) + i)}
                />
              ))}
            </ol>
          </section>
        );
      })}
      {shown && lyricsAt !== null && (
        <LyricsView
          title={shown.song.title}
          lyrics={detailsOf.get(shown.song.id)?.lyrics ?? null}
          open
          onOpenChange={(open) => !open && setLyricsAt(null)}
          footer={
            <LyricsSteps
              previous={order[lyricsAt - 1]?.song.title ?? null}
              next={order[lyricsAt + 1]?.song.title ?? null}
              onStep={(step) => setLyricsAt(lyricsAt + step)}
            />
          }
        />
      )}
    </div>
  );
}

/** The lyrics view's way to the previous and next song, each named; none past the ends. */
function LyricsSteps({
  previous,
  next,
  onStep,
}: {
  previous: string | null;
  next: string | null;
  onStep: (step: 1 | -1) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      {previous !== null ? (
        <Button
          variant="outline"
          size="lg"
          className="h-12 min-w-0 flex-1 justify-start"
          aria-label={t("setlists.live.previous", { title: previous })}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft />
          <span className="truncate">{previous}</span>
        </Button>
      ) : (
        <div className="flex-1" />
      )}
      {next !== null ? (
        <Button
          variant="outline"
          size="lg"
          className="h-12 min-w-0 flex-1 justify-end"
          aria-label={t("setlists.live.next", { title: next })}
          onClick={() => onStep(1)}
        >
          <span className="truncate">{next}</span>
          <ChevronRight />
        </Button>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

/**
 * One song: its index, title and artist, then its tempo and key and its buttons (lyrics, #308);
 * its notes under it.
 */
function LiveSongRow({
  index,
  song,
  notes,
  hasLyrics,
  onLyrics,
}: {
  index: number;
  song: LiveSong;
  notes: string | null;
  hasLyrics: boolean;
  onLyrics: () => void;
}) {
  const { t } = useTranslation();
  const key = song.bandKey ?? song.key;
  const details = [song.tempo && t("songs.bpm", { tempo: song.tempo }), key && keyShort(key)]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex gap-3 py-3">
      <span className="w-6 shrink-0 pt-1 text-right text-muted-foreground tabular-nums">
        {index}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words text-xl leading-snug">
          <span className="font-bold">{song.title}</span>
          <span className="text-base text-muted-foreground"> · {song.artist}</span>
        </p>
        {(details || hasLyrics) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {details && <span className="text-muted-foreground">{details}</span>}
            {hasLyrics && (
              <Button
                variant="outline"
                className="size-11"
                aria-label={t("setlists.live.lyrics")}
                onClick={onLyrics}
              >
                <MicVocal className="size-5" />
              </Button>
            )}
          </div>
        )}
        {notes && <LiveNotes notes={notes} />}
      </div>
    </li>
  );
}

/** A song's notes on one small line; a tap shows them whole when they're longer. */
function LiveNotes({ notes }: { notes: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [longer, setLonger] = useState(false);
  // Longer than its line: cut, or on several lines.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !open) setLonger(element.scrollHeight > element.clientHeight + 1);
  }, [open]);
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={longer ? open : undefined}
      aria-label={longer && !open ? t("setlists.live.notesMore") : undefined}
      disabled={!longer}
      onClick={() => setOpen(!open)}
      className={cn(
        "block w-full whitespace-pre-wrap break-words rounded text-left text-amber-700 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default dark:text-amber-300",
        !open && "line-clamp-1",
      )}
    >
      {notes}
    </button>
  );
}

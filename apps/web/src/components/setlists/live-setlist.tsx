import { keyShort } from "@coverband/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BandLogo } from "@/components/band/band-logo";
import { ListSkeleton } from "@/components/loading";
import { songsDuration } from "@/components/setlists/setlist-duration";
import { bandQuery } from "@/lib/bands";
import { errorMessage, replacesData } from "@/lib/errors";
import { useLeaveFullscreenOnClose } from "@/lib/live";
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
  const notesOf = new Map(
    details.flatMap((query) => (query.data ? [[query.data.id, query.data.notes] as const] : [])),
  );

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
                  notes={notesOf.get(song.id) ?? null}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/** One song: its index, title and artist, then its tempo and key; its notes under it. */
function LiveSongRow({
  index,
  song,
  notes,
}: {
  index: number;
  song: LiveSong;
  notes: string | null;
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
        {details && <p className="text-muted-foreground">{details}</p>}
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

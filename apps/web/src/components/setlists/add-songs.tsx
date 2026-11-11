import { formatDuration, playedDuration, SETLIST_LIMITS } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Search } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
import { EnergyPeppers, SongStatusBadge } from "@/components/songs/song-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage, replacesData } from "@/lib/errors";
import {
  DEFAULT_DIRECTION,
  type RepertoireSort,
  type SortDirection,
  sortSongs,
} from "@/lib/repertoire";
import { type Draft, type DraftSong, songChoices, songCount } from "@/lib/setlist-editor";
import { songsQuery } from "@/lib/songs";
import { cn } from "@/lib/utils";

/** The add-songs panel full screen, on a phone (#283): as many songs as the screen holds. */
export function AddSongsDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-none p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-none"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Songs to add to a part (#272): the repertoire's "ready" songs by default, the songs being
 * learned too with a switch, searched by title and artist; chosen, then added at the part's end.
 * A song already in the setlist says where, and that it would be played twice once chosen.
 *
 * `dialog` (a phone, #283): full screen, the part to add to in the header, a sort, one line per
 * song chosen by tapping it, Cancel beside the button. `aside` (a large screen): beside the
 * setlist, with checkboxes.
 */
export function AddSongsPanel({
  bandSlug,
  draft,
  defaultPart,
  disabled,
  variant = "aside",
  onAdd,
  onCancel,
}: {
  bandSlug: string;
  draft: Draft;
  defaultPart: number;
  disabled: boolean;
  variant?: "aside" | "dialog";
  onAdd: (part: number, songs: DraftSong[]) => void;
  onCancel?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const id = useId();
  const songs = useQuery(songsQuery(bandSlug));
  const [part, setPart] = useState(String(defaultPart));
  const [query, setQuery] = useState("");
  const [learning, setLearning] = useState(false);
  const [sort, setSort] = useState<RepertoireSort>("title");
  const [direction, setDirection] = useState<SortDirection>(DEFAULT_DIRECTION.title);
  const [checked, setChecked] = useState<string[]>([]);
  const dialog = variant === "dialog";
  const target = Math.min(Number(part), draft.length - 1);
  const partLabel = (index: number) =>
    draft[index]?.name ?? t("setlists.part.default", { n: index + 1 });
  const room = SETLIST_LIMITS.songs - songCount(draft);
  const choices = songChoices(songs.data ?? [], { query, learning });
  const shown = dialog ? sortSongs(choices, sort, direction) : choices;

  /** Where a song already is in the setlist (part labels). */
  const placesOf = (songId: string) =>
    draft.flatMap((p, index) =>
      p.songs.some((entry) => entry.song.id === songId) ? [partLabel(index)] : [],
    );

  const toggle = (songId: string) =>
    setChecked((list) =>
      list.includes(songId) ? list.filter((other) => other !== songId) : [...list, songId],
    );

  const add = () => {
    const byId = new Map((songs.data ?? []).map((song) => [song.id, song]));
    onAdd(
      target,
      checked.flatMap((songId) => {
        const song = byId.get(songId);
        return song ? [song] : [];
      }),
    );
    setChecked([]);
  };

  const partSelect = (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={`${id}-part`} className="text-muted-foreground">
        {t("setlists.add.to")}
      </label>
      <Select value={String(target)} onValueChange={setPart}>
        <SelectTrigger id={`${id}-part`} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {draft.map((p, index) => (
            <SelectItem key={p.key} value={String(index)}>
              {partLabel(index)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const search = (
    <div className="relative min-w-0 flex-1">
      <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
      <Input
        type="search"
        aria-label={t("setlists.add.search")}
        placeholder={t("setlists.add.search")}
        className="pl-9"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </div>
  );

  const learningSwitch = (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={learning}
        onChange={(event) => setLearning(event.target.checked)}
      />
      {t("setlists.add.learning")}
    </label>
  );

  const addButton = (
    <Button
      className={dialog ? "flex-1" : undefined}
      disabled={disabled || checked.length === 0}
      onClick={add}
    >
      {checked.length
        ? t("setlists.add.button", { count: checked.length, part: partLabel(target) })
        : t("setlists.add.choose")}
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {dialog ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <DialogTitle className="font-heading">{t("setlists.add.title")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("setlists.add.description")}
            </DialogDescription>
            {partSelect}
          </div>
          <div className="flex items-center gap-1">
            {search}
            <Select
              value={sort}
              onValueChange={(value) => {
                // Each sort starts in its own direction: titles A to Z, the hottest songs first.
                setSort(value as RepertoireSort);
                setDirection(DEFAULT_DIRECTION[value as RepertoireSort]);
              }}
            >
              <SelectTrigger aria-label={t("songs.sort.label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="title">{t("songs.sort.title")}</SelectItem>
                <SelectItem value="energy">{t("songs.sort.energy")}</SelectItem>
              </SelectContent>
            </Select>
            {/* Named after the current direction; pressing it reverses the order. */}
            <Button
              variant="outline"
              size="icon"
              aria-label={t(`songs.sort.${direction}`)}
              title={t(`songs.sort.${direction}`)}
              onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
            >
              {direction === "asc" ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
            </Button>
          </div>
          {learningSwitch}
        </>
      ) : (
        <>
          {partSelect}
          {search}
          {learningSwitch}
        </>
      )}

      {songs.isPending ? (
        <ListSkeleton rows={4} />
      ) : songs.data === undefined || replacesData(songs.error) ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, songs.error)}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("setlists.add.none")}</p>
      ) : (
        <ul
          className={cn("min-h-0 flex-1 overflow-y-auto", dialog ? "-mx-1" : "-mx-2 divide-y")}
          aria-label={t("setlists.add.songs")}
        >
          {shown.map((song) => {
            const on = checked.includes(song.id);
            const places = placesOf(song.id);
            const duration = playedDuration(song);
            const full = !on && checked.length >= room;
            const where =
              places.length > 0 &&
              (on
                ? t("setlists.add.twice", { parts: places.join(", ") })
                : t(dialog ? "setlists.add.played" : "setlists.add.inSetlist", {
                    parts: places.join(", "),
                  }));
            return dialog ? (
              <li key={song.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled || full}
                  onClick={() => toggle(song.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    on
                      ? "bg-primary/15"
                      : places.length > 0
                        ? "bg-amber-500/10 hover:bg-amber-500/20"
                        : "hover:bg-accent",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      on && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                  {learning && (
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        song.status === "ready" ? "bg-primary" : "bg-amber-500",
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="font-medium">{song.title}</span>
                      <span className="text-muted-foreground"> · {song.artist}</span>
                      {learning && (
                        <span className="sr-only"> ({t(`songs.status.${song.status}`)})</span>
                      )}
                    </span>
                    {where && (
                      <span className="block truncate text-amber-700 text-xs dark:text-amber-300">
                        {where}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {duration === null ? "—" : formatDuration(duration)}
                  </span>
                  <EnergyPeppers energy={song.energy} className="shrink-0 text-xs" />
                </button>
              </li>
            ) : (
              <li key={song.id}>
                <label
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    (disabled || full) && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={on}
                    disabled={disabled || full}
                    onChange={() => toggle(song.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{song.title}</span>
                    <span className="block truncate text-muted-foreground text-sm">
                      {song.artist}
                    </span>
                    {where && (
                      <span
                        className={cn(
                          "block text-xs",
                          on ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                        )}
                      >
                        {where}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
                    {song.status !== "ready" && <SongStatusBadge status={song.status} />}
                    <span>{duration === null ? "—" : formatDuration(duration)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {room <= 0 && (
        <p className="text-muted-foreground text-xs">
          {t("setlists.add.full", { max: SETLIST_LIMITS.songs })}
        </p>
      )}
      {dialog ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          {addButton}
        </div>
      ) : (
        addButton
      )}
    </div>
  );
}

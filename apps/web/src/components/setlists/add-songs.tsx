import { formatDuration, playedDuration, SETLIST_LIMITS } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListSkeleton } from "@/components/loading";
import { SongStatusBadge } from "@/components/songs/song-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage, replacesData } from "@/lib/errors";
import { type Draft, type DraftSong, songChoices, songCount } from "@/lib/setlist-editor";
import { songsQuery } from "@/lib/songs";
import { cn } from "@/lib/utils";

/** The add-songs panel in a dialog, full height on a phone. */
export function AddSongsDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading">{t("setlists.add.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("setlists.add.description")}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Songs to add to a part (#272): the repertoire's "ready" songs by default, the songs being
 * learned too with a switch, searched by title and artist; ticked, then added at the part's end.
 * A song already in the setlist says where, and that it would be played twice once ticked.
 */
export function AddSongsPanel({
  bandSlug,
  draft,
  defaultPart,
  disabled,
  onAdd,
}: {
  bandSlug: string;
  draft: Draft;
  defaultPart: number;
  disabled: boolean;
  onAdd: (part: number, songs: DraftSong[]) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const songs = useQuery(songsQuery(bandSlug));
  const [part, setPart] = useState(String(defaultPart));
  const [query, setQuery] = useState("");
  const [learning, setLearning] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const target = Math.min(Number(part), draft.length - 1);
  const partLabel = (index: number) =>
    draft[index]?.name ?? t("setlists.part.default", { n: index + 1 });
  const room = SETLIST_LIMITS.songs - songCount(draft);
  const shown = songChoices(songs.data ?? [], { query, learning });

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={`${id}-part`} className="text-muted-foreground">
          {t("setlists.add.to")}
        </label>
        <Select value={String(target)} onValueChange={setPart}>
          <SelectTrigger id={`${id}-part`} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {draft.map((p, index) => (
              <SelectItem key={p.key} value={String(index)}>
                {partLabel(index)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="relative">
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
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={learning}
          onChange={(event) => setLearning(event.target.checked)}
        />
        {t("setlists.add.learning")}
      </label>

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
          className="-mx-2 min-h-0 flex-1 divide-y overflow-y-auto"
          aria-label={t("setlists.add.songs")}
        >
          {shown.map((song) => {
            const on = checked.includes(song.id);
            const places = placesOf(song.id);
            const duration = playedDuration(song);
            const full = !on && checked.length >= room;
            return (
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
                    {places.length > 0 && (
                      <span
                        className={cn(
                          "block text-xs",
                          on ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                        )}
                      >
                        {on
                          ? t("setlists.add.twice", { parts: places.join(", ") })
                          : t("setlists.add.inSetlist", { parts: places.join(", ") })}
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
      <Button disabled={disabled || checked.length === 0} onClick={add}>
        {checked.length
          ? t("setlists.add.button", { count: checked.length, part: partLabel(target) })
          : t("setlists.add.choose")}
      </Button>
    </div>
  );
}

import {
  findDuplicateSong,
  formatDuration,
  isMusicalKey,
  MAX_SONG_DURATION,
  normalizeName,
  parseDuration,
  SONG_MAX_LENGTH,
  SONG_TEMPO,
  songKey,
} from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeySelect } from "@/components/songs/key-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiRequestError, errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { addSong, type Song, type SongFields, songsQuery, updateSong } from "@/lib/songs";

type Props = {
  bandSlug: string;
  /** The song to edit; adds a new one when absent. */
  song?: Song;
  /** What it edits of the song: its title and artist, or its details. */
  part?: "main" | "details";
  /** The button opening the dialog. */
  trigger: ReactNode;
  /** Shown next to the button (an icon button's name). */
  tooltip?: string;
};

/** The song of the repertoire it matches. */
type Duplicate = { title: string; artist: string };

const durations = ["standardDuration", "ownDuration"] as const;

type Main = Pick<SongFields, "title" | "artist">;
type Details = Pick<SongFields, (typeof durations)[number] | "key" | "bandKey" | "tempo" | "style">;

/**
 * Adds a song to the repertoire (every field but the notes), or edits one block of it: its title
 * and artist, or its details (#120). A song with the same title and artist as another one of the
 * repertoire is a warning: saving again confirms it (#88).
 */
export function SongFormDialog({ bandSlug, song, part, trigger, tooltip }: Props) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const repertoire = useQuery(songsQuery(bandSlug));
  // Each style once, however it was typed (the first spelling wins).
  const styles = [
    ...new Map(
      (repertoire.data ?? [])
        .flatMap((s) => (s.style ? [[normalizeName(s.style), s.style] as const] : []))
        .reverse(),
    ).values(),
  ].sort((a, b) => a.localeCompare(b));
  const withMain = !song || part === "main";
  const withDetails = !song || part === "details";
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState<(typeof durations)[number][]>([]);
  // The durations are readable but over the limit.
  const [tooLong, setTooLong] = useState(false);
  // Shown once; saving again with the same title and artist confirms it.
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  const save = useMutation({
    mutationFn: (fields: Partial<Main & Details> & { confirmDuplicate: boolean }) =>
      song
        ? updateSong(bandSlug, song.id, fields)
        : // Adding: the form has every field.
          addSong(bandSlug, fields as Main & Details & { confirmDuplicate: boolean }),
    onSuccess: async () => {
      toast.success(song ? t("songs.saved") : t("songs.added"));
      onOpenChange(false);
      // The repertoire, this song and the journal.
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
    onError: (error, fields) => {
      // Someone added the same song meanwhile: the same warning.
      if (error instanceof ApiRequestError && error.code === "song_duplicate") {
        save.reset();
        const { title = fields.title ?? "", artist = fields.artist ?? "" } = error.details;
        setDuplicate({ title, artist });
      }
    },
  });

  // Every opening starts fresh.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      save.reset();
      setInvalid([]);
      setTooLong(false);
      setDuplicate(null);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const parsed = Object.fromEntries(
      durations.map((name) => [name, text(name) ? parseDuration(text(name)) : null]),
    ) as Record<(typeof durations)[number], number | null>;
    const wrong = durations.filter((name) => text(name) && parsed[name] === null);
    const over = durations.filter((name) => (parsed[name] ?? 0) > MAX_SONG_DURATION);
    setInvalid([...wrong, ...over]);
    setTooLong(over.length > 0 && wrong.length === 0);
    if (wrong.length > 0 || over.length > 0) return;

    const key = (name: string) => {
      const value = text(name);
      return isMusicalKey(value) ? value : null;
    };
    const main: Main = { title: text("title"), artist: text("artist") };
    const details: Details = {
      ...parsed,
      key: key("key"),
      bandKey: key("bandKey"),
      tempo: text("tempo") ? Number(text("tempo")) : null,
      style: text("style") || null,
    };
    // Like the API: only a different song is checked (an accepted duplicate stays accepted).
    const renamed = withMain && (!song || songKey(song) !== songKey(main));
    if (!duplicate && renamed) {
      const match = findDuplicateSong(repertoire.data ?? [], main, song?.id);
      if (match) {
        setDuplicate({ title: match.title, artist: match.artist });
        return;
      }
    }
    // Only the fields shown: the others stay as they are.
    save.mutate({
      ...(withMain && main),
      ...(withDetails && details),
      confirmDuplicate: duplicate !== null,
    });
  }

  const submitLabel = save.isPending
    ? song
      ? t("common.saving")
      : t("songs.form.adding")
    : duplicate
      ? song
        ? t("songs.form.saveAnyway")
        : t("songs.form.addAnyway")
      : song
        ? t("common.save")
        : t("songs.form.add");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild disabled={!online}>
              {trigger}
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild disabled={!online}>
          {trigger}
        </DialogTrigger>
      )}
      {/* Taller than a phone's screen: it scrolls. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {!song
                ? t("songs.form.addTitle")
                : withMain
                  ? t("songs.form.editTitle")
                  : t("songs.form.detailsTitle")}
            </DialogTitle>
          </DialogHeader>
          {withMain &&
            (["title", "artist"] as const).map((name) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={`song-${name}`}>{t(`songs.form.${name}`)}</Label>
                <Input
                  id={`song-${name}`}
                  name={name}
                  defaultValue={song?.[name] ?? ""}
                  maxLength={SONG_MAX_LENGTH[name]}
                  autoComplete="off"
                  required
                  // A different song: the warning no longer applies.
                  onChange={() => setDuplicate(null)}
                />
              </div>
            ))}
          {withDetails && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {durations.map((name) => (
                  <div key={name} className="space-y-2">
                    <Label htmlFor={`song-${name}`}>{t(`songs.form.${name}`)}</Label>
                    <Input
                      id={`song-${name}`}
                      name={name}
                      defaultValue={song?.[name] != null ? formatDuration(song[name]) : ""}
                      placeholder="3:45"
                      autoComplete="off"
                      aria-invalid={invalid.includes(name)}
                      aria-describedby="song-duration-hint"
                      onChange={() => setInvalid((list) => list.filter((n) => n !== name))}
                    />
                  </div>
                ))}
              </div>
              <p
                id="song-duration-hint"
                className={
                  invalid.length > 0 ? "text-destructive text-xs" : "text-muted-foreground text-xs"
                }
                role={invalid.length > 0 ? "alert" : undefined}
              >
                {invalid.length === 0
                  ? t("songs.form.durationHint")
                  : tooLong
                    ? t("songs.form.durationTooLong", { max: formatDuration(MAX_SONG_DURATION) })
                    : t("songs.form.invalidDuration")}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {(["key", "bandKey"] as const).map((name) => (
                  <div key={name} className="space-y-2">
                    <Label htmlFor={`song-${name}`}>{t(`songs.form.${name}`)}</Label>
                    <KeySelect
                      id={`song-${name}`}
                      name={name}
                      defaultValue={song?.[name] ?? null}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="song-tempo">{t("songs.form.tempo")}</Label>
                  <Input
                    id="song-tempo"
                    name="tempo"
                    type="number"
                    inputMode="numeric"
                    min={SONG_TEMPO.min}
                    max={SONG_TEMPO.max}
                    step={1}
                    placeholder="120"
                    defaultValue={song?.tempo ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="song-style">{t("songs.form.style")}</Label>
                  <Input
                    id="song-style"
                    name="style"
                    list="song-styles"
                    defaultValue={song?.style ?? ""}
                    maxLength={SONG_MAX_LENGTH.style}
                    autoComplete="off"
                  />
                  {/* The band's earlier styles, suggested as you type. */}
                  <datalist id="song-styles">
                    {styles.map((style) => (
                      <option key={style} value={style} />
                    ))}
                  </datalist>
                </div>
              </div>
            </>
          )}
          {duplicate && (
            <div role="alert" className="space-y-1 rounded-lg bg-amber-500/15 p-3 text-sm">
              <p className="font-medium">{t("songs.form.duplicate", duplicate)}</p>
              <p className="text-muted-foreground">
                {t("songs.form.duplicateHint", { title: duplicate.title })}
              </p>
            </div>
          )}
          {save.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import {
  type Instrument,
  MEDIA_LIMITS,
  MEDIA_PROVIDER_NAMES,
  mediaProvider,
  parseMediaUrl,
} from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CollapsibleCard } from "@/components/collapsible-card";
import { InstrumentListEditor, withAdded } from "@/components/instruments/instrument-list-editor";
import { InstrumentTags } from "@/components/instruments/instrument-tags";
import { ProviderIcon } from "@/components/songs/provider-icon";
import { LinkSearch } from "@/components/songs/song-link-search";
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
import { fitTitle } from "@/lib/autofill";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { addMedia, deleteMedia, updateMedia } from "@/lib/songs";

type Media = { id: string; url: string; title: string | null; instruments: Instrument[] };

/** What a link search looks for (#220). */
type Song = { title: string; artist: string };

/** What a link is called: its title, else the provider's name, else the site. */
function linkName(media: Media) {
  const provider = mediaProvider(media.url);
  const site = provider
    ? MEDIA_PROVIDER_NAMES[provider]
    : (parseMediaUrl(media.url)?.hostname.replace(/^www\./, "") ?? media.url);
  return { name: media.title ?? site, site };
}

/** A song's links (#92): each opens in a new tab; any member adds, edits and removes them. */
export function SongMedia({
  bandSlug,
  songId,
  song,
  media,
}: {
  bandSlug: string;
  songId: string;
  song: Song;
  media: Media[];
}) {
  const { t } = useTranslation();
  return (
    // The one block of the song page open at first (#239).
    <CollapsibleCard title={t("songs.media.title")} defaultOpen>
      <div className="space-y-3">
        {media.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("songs.media.empty")}</p>
        ) : (
          <ul className="divide-y" aria-label={t("songs.media.title")}>
            {media.map((item) => {
              const { name, site } = linkName(item);
              return (
                <li key={item.id} className="flex items-start gap-2 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ProviderIcon url={item.url} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-medium">{name}</span>
                        {item.title && (
                          <span className="block truncate text-muted-foreground text-xs">
                            {site}
                          </span>
                        )}
                        <span className="sr-only">{t("songs.media.newTab")}</span>
                      </span>
                    </a>
                    <InstrumentTags instruments={item.instruments} className="pl-8" />
                  </div>
                  <MediaDialog
                    song={song}
                    bandSlug={bandSlug}
                    songId={songId}
                    media={item}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("songs.media.edit", { name })}
                      >
                        <Pencil />
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
        {media.length < MEDIA_LIMITS.perSong && (
          <MediaDialog
            song={song}
            bandSlug={bandSlug}
            songId={songId}
            trigger={
              <Button variant="outline" size="sm">
                <Plus />
                {t("songs.media.add")}
              </Button>
            }
          />
        )}
      </div>
    </CollapsibleCard>
  );
}

/** Adds a link to a song, or edits (and removes) one. */
function MediaDialog({
  bandSlug,
  songId,
  song,
  media,
  trigger,
}: {
  bandSlug: string;
  songId: string;
  song: Song;
  media?: Media;
  trigger: ReactNode;
}) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>(media?.instruments ?? []);
  const [typed, setTyped] = useState<Instrument | null>(null);
  const [badUrl, setBadUrl] = useState(false);
  const [url, setUrl] = useState(media?.url ?? "");
  const [title, setTitle] = useState(media?.title ?? "");
  // A new link searched on Deezer (#220): the search shows instead of the form, which it fills.
  const [searching, setSearching] = useState(false);
  const done = async (message: string) => {
    toast.success(message);
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
  };

  const save = useMutation({
    mutationFn: (fields: { url: string; title: string | null; instruments: Instrument[] }) =>
      media ? updateMedia(bandSlug, songId, media.id, fields) : addMedia(bandSlug, songId, fields),
    onSuccess: () => done(media ? t("songs.media.saved") : t("songs.media.added")),
  });
  const remove = useMutation({
    mutationFn: () => deleteMedia(bandSlug, songId, media?.id ?? ""),
    onSuccess: () => done(t("songs.media.removed")),
  });

  // Every opening starts from the link as it is.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setInstruments(media?.instruments ?? []);
      setTyped(null);
      setBadUrl(false);
      setUrl(media?.url ?? "");
      setTitle(media?.title ?? "");
      setSearching(false);
      save.reset();
      remove.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parseMediaUrl(url.trim())) {
      setBadUrl(true);
      return;
    }
    save.mutate({
      url: url.trim(),
      title: title.trim() || null,
      instruments: withAdded(instruments, typed),
    });
  }

  const error = save.error ?? remove.error;
  // One request at a time: saving and removing the same link at once would fail.
  const busy = save.isPending || remove.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild disabled={!online}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {searching ? (
          <LinkSearch
            bandSlug={bandSlug}
            song={song}
            onBack={() => setSearching(false)}
            onChoose={(track) => {
              // The track's own title: it says "Live", "Remastered"... the page has the song's.
              setUrl(track.url);
              setTitle(fitTitle(track.title) ?? "");
              setBadUrl(false);
              setSearching(false);
            }}
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {media ? t("songs.media.editTitle") : t("songs.media.addTitle")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="media-url">{t("songs.media.url")}</Label>
              <Input
                id="media-url"
                name="url"
                type="url"
                inputMode="url"
                value={url}
                maxLength={MEDIA_LIMITS.url}
                placeholder="https://"
                autoComplete="off"
                required
                aria-invalid={badUrl}
                aria-describedby="media-url-hint"
                onChange={(event) => {
                  setUrl(event.target.value);
                  setBadUrl(false);
                }}
              />
              <p
                id="media-url-hint"
                role={badUrl ? "alert" : undefined}
                className={badUrl ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
              >
                {badUrl ? t("songs.media.urlInvalid") : t("songs.media.urlHint")}
              </p>
              {!media && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSearching(true)}
                >
                  <ProviderIcon url="https://www.deezer.com" className="size-4" />
                  {t("songs.media.search.open")}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="media-title">{t("songs.media.linkTitle")}</Label>
              <Input
                id="media-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={MEDIA_LIMITS.title}
                autoComplete="off"
                aria-describedby="media-title-hint"
              />
              <p id="media-title-hint" className="text-muted-foreground text-xs">
                {t("songs.media.linkTitleHint")}
              </p>
            </div>
            <fieldset className="space-y-2">
              <legend className="font-medium text-sm">{t("songs.media.instruments")}</legend>
              <p className="text-muted-foreground text-xs">{t("songs.media.instrumentsHint")}</p>
              <InstrumentListEditor
                id="media-instrument"
                list={instruments}
                onChange={setInstruments}
                typed={typed}
                onType={setTyped}
                nested
              />
            </fieldset>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(t, error)}
              </p>
            )}
            <DialogFooter className="gap-2">
              {media && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  pending={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  <Trash2 />
                  {t("songs.media.remove")}
                </Button>
              )}
              <Button type="submit" disabled={busy} pending={save.isPending}>
                {save.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

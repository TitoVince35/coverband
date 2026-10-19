import { type LyricsSource, SONG_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { ChevronDown, Maximize2, Pencil, Search, XIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LyricsView } from "@/components/songs/lyrics-view";
import { LyricsSearchDialog, WebSearchButton } from "@/components/songs/song-lyrics-search";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { storedText, updateSong } from "@/lib/songs";

type Props = { bandSlug: string; songId: string; lyrics: string | null };

/** Wider than a phone: the lyrics block starts open. */
const startsOpen = () => {
  try {
    return window.matchMedia("(min-width: 640px)").matches;
  } catch {
    return false;
  }
};

/**
 * A song's lyrics (#129): a block closed on a phone, open on a wider screen, whose text is half a
 * screen tall and scrolls. Any member edits them in a modal.
 */
export function SongLyrics({
  bandSlug,
  songId,
  lyrics,
  source,
  title,
  artist,
}: Props & { source: LyricsSource | null; title: string; artist: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(startsOpen);
  const [editing, setEditing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [viewing, setViewing] = useState(false);
  // Lyrics cleared by someone else while they're viewed: the view closes for good, rather than
  // popping open again when new lyrics come.
  if (viewing && !lyrics) setViewing(false);

  return (
    <Card>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-6 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {/* Plain text, like the other cards' titles: a heading is lost inside a summary. */}
          <span className="flex-1 font-heading font-medium text-lg">{t("songs.lyrics.title")}</span>
          <ChevronDown
            aria-hidden
            className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </summary>
        <CardContent className="space-y-4 pt-4">
          {lyrics ? (
            <div className="space-y-2">
              <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3">
                {lyrics}
              </div>
              {source === "lrclib" && (
                <p className="text-muted-foreground text-xs">{t("songs.lyrics.credit")}</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("songs.lyrics.empty")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {lyrics && (
              <Button onClick={() => setViewing(true)}>
                <Maximize2 />
                {t("songs.lyrics.view.button")}
              </Button>
            )}
            {!lyrics && (
              <Button onClick={() => setSearching(true)}>
                <Search />
                {t("songs.lyrics.search.button")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              {lyrics ? t("songs.lyrics.edit") : t("songs.lyrics.typeIn")}
            </Button>
          </div>
        </CardContent>
      </details>
      <LyricsEditor
        bandSlug={bandSlug}
        songId={songId}
        lyrics={lyrics}
        song={{ title, artist }}
        open={editing}
        onOpenChange={setEditing}
        onReplace={() => {
          setEditing(false);
          setSearching(true);
        }}
      />
      {lyrics && (
        <LyricsView title={title} lyrics={lyrics} open={viewing} onOpenChange={setViewing} />
      )}
      <LyricsSearchDialog
        bandSlug={bandSlug}
        songId={songId}
        song={{ title, artist }}
        open={searching}
        onOpenChange={setSearching}
        onTypeIn={() => {
          setSearching(false);
          setEditing(true);
        }}
      />
    </Card>
  );
}

/** The lyrics in a modal, full screen on a phone; closing it with changes asks first. */
type EditorProps = Props & {
  song: { title: string; artist: string };
  /** Leaves the editor for the online search. */
  onReplace: () => void;
};

function LyricsEditor({
  open,
  onOpenChange,
  ...props
}: EditorProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Each opening starts from the saved lyrics. */}
      {open && <EditorContent {...props} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function EditorContent({
  bandSlug,
  songId,
  lyrics,
  song,
  onReplace,
  onClose,
}: EditorProps & { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The lyrics as they were when the editor opened: a refetch meanwhile (someone else saving)
  // doesn't make the draft a change. Saving then replaces theirs: the last one wins.
  const [base] = useState(lyrics);
  const [draft, setDraft] = useState(lyrics ?? "");
  // Leaving with changes asks first: then close, or go and search online.
  const [confirming, setConfirming] = useState<"close" | "replace" | null>(null);
  const changed = storedText(draft) !== base;
  // Pasted text over the limit isn't cut: it's shown, and can't be saved.
  const tooLong = draft.trim().length > SONG_MAX_LENGTH.lyrics;

  const save = useMutation({
    mutationFn: () => updateSong(bandSlug, songId, { lyrics: storedText(draft) }),
    onSuccess: async () => {
      // The song first: reopening the editor at once starts from the saved lyrics.
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      toast.success(t("songs.lyrics.saved"));
      onClose();
    },
  });

  // Leaving the page with changes asks too.
  const blocker = useBlocker({
    shouldBlockFn: () => changed && !save.isSuccess,
    enableBeforeUnload: () => changed,
    withResolver: true,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changed && !tooLong && !save.isPending) save.mutate();
  }

  // Escape, the close button or a tap outside: with changes, ask first.
  function close(event?: Event) {
    event?.preventDefault();
    if (changed) setConfirming("close");
    else onClose();
  }

  function replace() {
    if (changed) setConfirming("replace");
    else onReplace();
  }

  return (
    <>
      <DialogContent
        className="h-dvh max-w-full grid-rows-[auto_1fr_auto] rounded-none sm:h-[80dvh] sm:max-w-2xl sm:rounded-4xl"
        onEscapeKeyDown={close}
        onPointerDownOutside={close}
        showCloseButton={false}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-4"
          aria-label={t("common.close")}
          onClick={() => close()}
        >
          <XIcon />
        </Button>
        <DialogHeader>
          <DialogTitle className="font-heading">{t("songs.lyrics.editTitle")}</DialogTitle>
        </DialogHeader>
        <form id="lyrics-form" onSubmit={onSubmit} className="flex min-h-0 flex-col gap-3">
          <Textarea
            aria-label={t("songs.lyrics.title")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-invalid={tooLong}
            aria-describedby="lyrics-length"
            placeholder={t("songs.lyrics.placeholder")}
            className="min-h-0 flex-1 resize-none"
          />
          <p
            id="lyrics-length"
            className={tooLong ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
          >
            {t("songs.lyrics.length", {
              count: draft.trim().length,
              max: SONG_MAX_LENGTH.lyrics,
            })}
          </p>
          {save.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, save.error)}
            </p>
          )}
        </form>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={replace}>
              <Search />
              {t("songs.lyrics.search.replace")}
            </Button>
            <WebSearchButton song={song} />
          </div>
          <Button type="submit" form="lyrics-form" disabled={!changed || tooLong || save.isPending}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
      <AlertDialog
        open={confirming !== null || blocker.status === "blocked"}
        onOpenChange={(next) => {
          if (next) return;
          setConfirming(null);
          blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("songs.lyrics.unsaved.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("songs.lyrics.unsaved.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("songs.lyrics.unsaved.stay")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (blocker.status === "blocked") blocker.proceed();
                else if (confirming === "replace") onReplace();
                else onClose();
              }}
            >
              {t("songs.lyrics.unsaved.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { SONG_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { ChevronDown, Pencil, XIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { updateSong } from "@/lib/songs";

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
export function SongLyrics({ bandSlug, songId, lyrics }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(startsOpen);
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-6 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <h3 className="flex-1 font-heading font-medium text-lg">{t("songs.lyrics.title")}</h3>
          <ChevronDown
            aria-hidden
            className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </summary>
        <CardContent className="space-y-4 pt-4">
          {lyrics ? (
            <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3">
              {lyrics}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("songs.lyrics.empty")}</p>
          )}
          <div className="flex flex-wrap gap-2">
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
        open={editing}
        onOpenChange={setEditing}
      />
    </Card>
  );
}

/** The lyrics in a modal, full screen on a phone; closing it with changes asks first. */
function LyricsEditor({
  open,
  onOpenChange,
  ...props
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Each opening starts from the saved lyrics. */}
      {open && <EditorContent {...props} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function EditorContent({ bandSlug, songId, lyrics, onClose }: Props & { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(lyrics ?? "");
  const [confirming, setConfirming] = useState(false);
  // As the API stores them: trimmed, none when blank.
  const changed = (draft.trim() || null) !== lyrics;

  const save = useMutation({
    mutationFn: () => updateSong(bandSlug, songId, { lyrics: draft.trim() || null }),
    onSuccess: async () => {
      toast.success(t("songs.lyrics.saved"));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
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
    if (changed && !save.isPending) save.mutate();
  }

  // Escape, the close button or a tap outside: with changes, ask first.
  function close(event?: Event) {
    event?.preventDefault();
    if (changed) setConfirming(true);
    else onClose();
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
            maxLength={SONG_MAX_LENGTH.lyrics}
            placeholder={t("songs.lyrics.placeholder")}
            className="min-h-0 flex-1 resize-none"
          />
          {save.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, save.error)}
            </p>
          )}
        </form>
        <div className="flex justify-end">
          <Button type="submit" form="lyrics-form" disabled={!changed || save.isPending}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
      <AlertDialog
        open={confirming || blocker.status === "blocked"}
        onOpenChange={(next) => {
          if (next) return;
          setConfirming(false);
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

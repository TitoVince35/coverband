import { SONG_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { storedText as stored, updateSong } from "@/lib/songs";

/**
 * A song's notes (#121), edited in place: Save is active once they change, and leaving the page
 * with changes asks first. Two members saving at once: the last one wins.
 */
export function SongNotes({
  bandSlug,
  songId,
  notes,
}: {
  bandSlug: string;
  songId: string;
  notes: string | null;
}) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(notes ?? "");
  // The saved notes the draft started from: when they change (saved here or by someone else),
  // an untouched draft follows them.
  const [base, setBase] = useState(notes);
  if (notes !== base) {
    setBase(notes);
    if (stored(draft) === base) setDraft(notes ?? "");
  }
  const changed = stored(draft) !== notes;

  const save = useMutation({
    mutationFn: (value: string | null) => updateSong(bandSlug, songId, { notes: value }),
    onSuccess: async () => {
      toast.success(t("songs.notesSaved"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
  });

  const blocker = useBlocker({
    shouldBlockFn: () => changed,
    enableBeforeUnload: () => changed,
    withResolver: true,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changed && !save.isPending) save.mutate(stored(draft));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("songs.notes")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Textarea
            aria-label={t("songs.notes")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={SONG_MAX_LENGTH.notes}
            placeholder={t("songs.form.notesPlaceholder")}
            rows={4}
          />
          {save.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, save.error)}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!online || !changed} pending={save.isPending}>
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </CardContent>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("songs.unsavedNotes.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("songs.unsavedNotes.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("songs.unsavedNotes.stay")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              {t("songs.unsavedNotes.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

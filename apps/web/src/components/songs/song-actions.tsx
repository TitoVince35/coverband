import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { deleteSong, setSongArchived } from "@/lib/songs";

type Props = {
  bandSlug: string;
  song: { id: string; title: string; archivedAt: string | null };
  /** Band leaders also delete songs for good. */
  isLeader: boolean;
};

/** Archive or restore a song (any member); delete it for good (band leaders, #91). */
export function SongActions({ bandSlug, song, isLeader }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const archived = song.archivedAt !== null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });

  const archive = useMutation({
    mutationFn: (next: boolean) => setSongArchived(bandSlug, song.id, next),
    onSuccess: async (_song, next) => {
      toast.success(next ? t("songs.archive.done") : t("songs.archive.restored"));
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteSong(bandSlug, song.id),
    onSuccess: async () => {
      toast.success(t("songs.delete.done"));
      await navigate({ to: "/b/$bandSlug/songs", params: { bandSlug } });
      // After leaving the page: the song's own query would refetch a 404.
      queryClient.removeQueries({ queryKey: ["bands", bandSlug, "songs", song.id] });
      await refresh();
    },
  });

  const error = archive.error ?? remove.error;
  // An archived song is restored from its banner; only a band leader has more to do here.
  if (archived && !isLeader) return null;
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        {!archived && (
          <Button
            variant="outline"
            disabled={archive.isPending}
            onClick={() => archive.mutate(true)}
          >
            <Archive />
            {t("songs.archive.button")}
          </Button>
        )}
        {isLeader && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive">
                <Trash2 />
                {t("songs.delete.button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("songs.delete.title", { title: song.title })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t("songs.delete.description")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                  {t("songs.delete.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {!archived && <p className="text-muted-foreground text-xs">{t("songs.archive.hint")}</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(t, error)}
        </p>
      )}
    </div>
  );
}

/** Shown on an archived song: it's out of the repertoire, and a tap brings it back. */
export function ArchivedBanner({ bandSlug, songId }: { bandSlug: string; songId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: () => setSongArchived(bandSlug, songId, false),
    onSuccess: async () => {
      toast.success(t("songs.archive.restored"));
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
    },
  });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm">
      <Archive className="size-4 shrink-0 text-muted-foreground" />
      <p role="status" className="flex-1">
        {t("songs.archive.banner")}
      </p>
      <Button size="sm" disabled={restore.isPending} onClick={() => restore.mutate()}>
        <ArchiveRestore />
        {t("songs.archive.restore")}
      </Button>
      {restore.isError && (
        <p role="alert" className="w-full text-destructive">
          {errorMessage(t, restore.error)}
        </p>
      )}
    </div>
  );
}

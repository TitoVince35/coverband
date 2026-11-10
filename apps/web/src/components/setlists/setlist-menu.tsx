import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SetlistTitleDialog } from "@/components/setlists/setlist-title-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sessionQuery } from "@/lib/auth";
import { bandQuery } from "@/lib/bands";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { canDeleteSetlist, deleteSetlist, setSetlistArchived } from "@/lib/setlists";

type Props = {
  bandSlug: string;
  setlist: { id: string; title: string; createdById: string | null; archivedAt: string | null };
  /** Deleting from the setlist's own page goes back to the list. */
  onDeleted?: () => void;
};

/**
 * A setlist's actions (#271): rename and archive (current ones), restore (archived ones), and
 * delete for good (the band leader and its author).
 */
export function SetlistMenu({ bandSlug, setlist, onDeleted }: Props) {
  const { t } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isLeader = useQuery(bandQuery(bandSlug)).data?.membership.role === "leader";
  const userId = useQuery(sessionQuery).data?.user.id;
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const archived = setlist.archivedAt !== null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });

  const archive = useMutation({
    networkMode: "always",
    mutationFn: (next: boolean) => setSetlistArchived(bandSlug, setlist.id, next),
    onSuccess: async (_saved, next) => {
      toast.success(next ? t("setlists.archive.done") : t("setlists.archive.restored"));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  const remove = useMutation({
    networkMode: "always",
    mutationFn: () => deleteSetlist(bandSlug, setlist.id),
    onSuccess: async () => {
      toast.success(t("setlists.delete.done"));
      if (onDeleted) onDeleted();
      else await navigate({ to: "/b/$bandSlug/setlists", params: { bandSlug } });
      // After leaving its page: its own query would refetch a 404.
      queryClient.removeQueries({ queryKey: ["bands", bandSlug, "setlists", setlist.id] });
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(t, error)),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("setlists.actions", { title: setlist.title })}
            pending={archive.isPending || remove.isPending}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {!archived && (
            <DropdownMenuItem disabled={!online} onSelect={() => setRenaming(true)}>
              <Pencil />
              {t("setlists.rename.title")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!online} onSelect={() => archive.mutate(!archived)}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? t("setlists.archive.restore") : t("setlists.archive.button")}
          </DropdownMenuItem>
          {canDeleteSetlist(setlist, { userId, isLeader }) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!online}
                onSelect={() => setDeleting(true)}
              >
                <Trash2 />
                {t("setlists.delete.button")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SetlistTitleDialog
        bandSlug={bandSlug}
        setlist={setlist}
        open={renaming}
        onOpenChange={setRenaming}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("setlists.delete.title", { title: setlist.title })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("setlists.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
              {t("setlists.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

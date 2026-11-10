import { SETLIST_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { createSetlist, renameSetlist } from "@/lib/setlists";

type Props = {
  bandSlug: string;
  /** A setlist to rename; none: a new one, opened once created. */
  setlist?: { id: string; title: string };
  /** What opens it, when it isn't controlled with `open`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** A new setlist's title, or a setlist's new one: unique within the band (#271). */
export function SetlistTitleDialog({ bandSlug, setlist, trigger, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const [title, setTitle] = useState(setlist?.title ?? "");

  const save = useMutation({
    networkMode: "always",
    mutationFn: (value: string) =>
      setlist ? renameSetlist(bandSlug, setlist.id, value) : createSetlist(bandSlug, value),
    onSuccess: async (saved) => {
      changeOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["bands", bandSlug] });
      if (setlist) {
        toast.success(t("setlists.rename.done"));
      } else if (saved) {
        await navigate({
          to: "/b/$bandSlug/setlists/$setlistId",
          params: { bandSlug, setlistId: saved.id },
        });
      }
    },
  });

  function changeOpen(next: boolean) {
    if (next) {
      setTitle(setlist?.title ?? "");
      save.reset();
    }
    setOwnOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      {trigger && (
        <DialogTrigger asChild disabled={!online}>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) save.mutate(title.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading">
              {setlist ? t("setlists.rename.title") : t("setlists.new.title")}
            </DialogTitle>
            <DialogDescription>
              {setlist ? t("setlists.rename.description") : t("setlists.new.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>{t("setlists.fields.title")}</Label>
            <Input
              id={id}
              value={title}
              maxLength={SETLIST_MAX_LENGTH.title}
              required
              autoFocus
              aria-invalid={save.isError || undefined}
              aria-describedby={save.isError ? `${id}-error` : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                if (save.isError) save.reset();
              }}
            />
            {save.isError && (
              <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
                {errorMessage(t, save.error)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!online || !title.trim()} pending={save.isPending}>
              {setlist ? t("setlists.rename.button") : t("setlists.new.button")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { FIELD_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";

type Band = { name: string; slug: string; genre: string | null };

/** Band leader only: edit the band's name and genre. A new name changes the band's URL. */
export function EditBandDialog({ band }: { band: Band }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (values: { name: string; genre: string }) => {
      const res = await api.bands[":bandSlug"].$patch({
        param: { bandSlug: band.slug },
        json: { name: values.name, genre: values.genre || null },
      });
      return (await (await ensureOk(res)).json()).band;
    },
    onSuccess: async (updated) => {
      toast.success(t("band.edit.saved"));
      setOpen(false);
      if (updated.slug !== band.slug) {
        // Same page, at the band's new address. The old address no longer exists.
        await navigate({ to: pathname.replace(`/b/${band.slug}`, `/b/${updated.slug}`) });
        queryClient.removeQueries({ queryKey: ["bands", band.slug] });
      }
      await queryClient.invalidateQueries({ queryKey: ["bands"] });
    },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) save.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({ name: String(form.get("name")), genre: String(form.get("genre")) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon-lg" aria-label={t("band.edit.button")}>
              <Pencil />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">{t("band.edit.button")}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("band.edit.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="band-name">{t("band.edit.name")}</Label>
            <Input
              id="band-name"
              name="name"
              defaultValue={band.name}
              maxLength={FIELD_MAX_LENGTH.bandName}
              required
              autoComplete="off"
              onChange={() => save.isError && save.reset()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="band-genre">{t("band.edit.genre")}</Label>
            <Input
              id="band-genre"
              name="genre"
              defaultValue={band.genre ?? ""}
              maxLength={FIELD_MAX_LENGTH.genre}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-xs">{t("band.edit.genreHint")}</p>
          </div>
          {save.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, save.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { type BandLogo, FIELD_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BandLogoField } from "@/components/band/band-logo-field";
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
import { useOnline } from "@/lib/online";

type Band = { name: string; slug: string; genre: string | null; logo: BandLogo | null };

/**
 * Band leader only: edit the band's genre and logo. The name is forever (it is also the band's
 * URL).
 */
export function EditBandDialog({ band }: { band: Band }) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (genre: string) => {
      const res = await api.bands[":bandSlug"].$patch({
        param: { bandSlug: band.slug },
        json: { genre: genre || null },
      });
      return (await (await ensureOk(res)).json()).band;
    },
    onSuccess: async () => {
      toast.success(t("band.edit.saved"));
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["bands"] });
    },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) save.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(String(new FormData(event.currentTarget).get("genre")));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild disabled={!online}>
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
            <Input id="band-name" value={band.name} disabled />
            <p className="text-muted-foreground text-xs">{t("band.edit.nameForever")}</p>
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
        {/* Saved on its own: the genre's Save doesn't send it. */}
        <div className="border-t pt-4">
          <BandLogoField bandSlug={band.slug} logo={band.logo} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

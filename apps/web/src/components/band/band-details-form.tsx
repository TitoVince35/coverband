import { FIELD_MAX_LENGTH } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";

/**
 * The band's details on its settings page (#221): the name, shown but forever (it is also the
 * band's URL), and the genre, saved with Save.
 */
export function BandDetailsForm({
  band,
}: {
  band: { name: string; slug: string; genre: string | null };
}) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [genre, setGenre] = useState(band.genre ?? "");

  const save = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.bands[":bandSlug"].$patch({
        param: { bandSlug: band.slug },
        json: { genre: value.trim() || null },
      });
      return (await (await ensureOk(res)).json()).band;
    },
    onSuccess: async () => {
      toast.success(t("band.edit.saved"));
      await queryClient.invalidateQueries({ queryKey: ["bands"] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(genre);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="band-name">{t("band.edit.name")}</Label>
        <Input id="band-name" value={band.name} disabled />
        <p className="text-muted-foreground text-xs">{t("band.edit.nameForever")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="band-genre">{t("band.edit.genre")}</Label>
        <Input
          id="band-genre"
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
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
      <div className="flex justify-end">
        <Button type="submit" disabled={!online} pending={save.isPending}>
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

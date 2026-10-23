import type { BandLogo } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LARGE_LOGO } from "@/components/band/band-logo";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";
import { LogoTooLargeError, prepareLogo } from "@/lib/logo";
import { useOnline } from "@/lib/online";

type Picked = { logo: Blob; thumbnail: Blob; url: string };

/**
 * The band's logo, on the band settings page (#176, #221): pick an image (fitted, never cropped,
 * and its thumbnail made in the browser), see it as the app shows it (no background, #189), save
 * it, or remove it.
 */
export function BandLogoField({ bandSlug, logo }: { bandSlug: string; logo: BandLogo | null }) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  // Frees the preview's object URL when it is replaced or the field goes away.
  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  // The band, the band list and their offline copy all carry the logo.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bands"] });

  const save = useMutation({
    mutationFn: async (files: Picked) => {
      const res = await api.bands[":bandSlug"].logo.$put({
        param: { bandSlug },
        form: {
          logo: new File([files.logo], "logo", { type: files.logo.type }),
          thumbnail: new File([files.thumbnail], "thumbnail", { type: files.thumbnail.type }),
        },
      });
      return (await (await ensureOk(res)).json()).logo;
    },
    onSuccess: async () => {
      setPicked(null);
      toast.success(t("band.logo.saved"));
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async () =>
      ensureOk(await api.bands[":bandSlug"].logo.$delete({ param: { bandSlug } })),
    onSuccess: async () => {
      toast.success(t("band.logo.removed"));
      await refresh();
    },
  });

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again still triggers a change
    if (!file) return;
    save.reset();
    try {
      const files = await prepareLogo(file);
      setPickError(null);
      setPicked({ ...files, url: URL.createObjectURL(files.logo) });
    } catch (error) {
      setPickError(
        error instanceof LogoTooLargeError
          ? t("errors.image_too_large")
          : t("errors.invalid_image"),
      );
    }
  }

  const busy = save.isPending || remove.isPending;
  const failed = [save, remove].find((mutation) => mutation.isError);
  const error = pickError ?? (failed ? errorMessage(t, failed.error) : null);
  const shown = picked?.url ?? logo?.url;

  return (
    <div className="space-y-3">
      <p className="font-medium text-sm">{t("band.logo.title")}</p>
      {shown ? (
        // As the band's home page shows it: the same size, on the page's background, no plate.
        <img
          src={shown}
          alt={picked ? t("band.logo.preview") : t("band.logo.current")}
          className={LARGE_LOGO}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("band.logo.none")}</p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {picked ? (
          <>
            <Button
              type="button"
              onClick={() => save.mutate(picked)}
              disabled={!online || busy}
              pending={save.isPending}
            >
              {save.isPending ? t("common.saving") : t("band.logo.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPicked(null);
                save.reset();
              }}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="outline" disabled={!online || busy}>
              <label className="cursor-pointer">
                {logo ? t("band.logo.change") : t("band.logo.choose")}
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/*"
                  className="sr-only"
                  onChange={onPick}
                  disabled={!online || busy}
                />
              </label>
            </Button>
            {logo && (
              <Button
                type="button"
                variant="outline"
                onClick={() => remove.mutate()}
                disabled={!online || busy}
                pending={remove.isPending}
              >
                {remove.isPending ? t("band.logo.removing") : t("band.logo.remove")}
              </Button>
            )}
          </>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{t("band.logo.hint")}</p>
    </div>
  );
}

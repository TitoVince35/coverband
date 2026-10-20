import { type BandLogo, LOGO_BACKGROUNDS, type LogoBackground } from "@coverband/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LogoPlate } from "@/components/band/logo-plate";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";
import { LogoTooLargeError, prepareLogo } from "@/lib/logo";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

type Picked = { logo: Blob; thumbnail: Blob; url: string };

/**
 * The band's logo, in the band leader's edit dialog (#176): pick an image (fitted, never cropped,
 * and its thumbnail made in the browser), see it on a light or dark background, save it; change
 * the background of the current one, or remove it (the band's initials show again).
 */
export function BandLogoField({ bandSlug, logo }: { bandSlug: string; logo: BandLogo | null }) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [background, setBackground] = useState<LogoBackground>(logo?.background ?? "light");
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
          background,
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

  const changeBackground = useMutation({
    mutationFn: async (next: LogoBackground) => {
      const res = await api.bands[":bandSlug"].logo.$patch({
        param: { bandSlug },
        json: { background: next },
      });
      return (await (await ensureOk(res)).json()).logo;
    },
    onSuccess: refresh,
    // Back to what is saved.
    onError: () => setBackground(logo?.background ?? "light"),
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

  function onBackground(next: LogoBackground) {
    setBackground(next);
    // A new logo is saved with its background; the current one's changes at once.
    if (!picked && logo) changeBackground.mutate(next);
  }

  const busy = save.isPending || remove.isPending || changeBackground.isPending;
  const failed = [save, changeBackground, remove].find((mutation) => mutation.isError);
  const error = pickError ?? (failed ? errorMessage(t, failed.error) : null);
  const shown = picked?.url ?? logo?.url;

  return (
    <div className="space-y-3">
      <p className="font-medium text-sm">{t("band.logo.title")}</p>
      {shown ? (
        <LogoPlate
          src={shown}
          background={background}
          alt={picked ? t("band.logo.preview") : t("band.logo.current")}
          className="h-32 w-full"
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("band.logo.none")}</p>
      )}
      {shown && (
        <BackgroundPicker value={background} onChange={onBackground} disabled={!online || busy} />
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {picked ? (
          <>
            <Button type="button" onClick={() => save.mutate(picked)} disabled={!online || busy}>
              {save.isPending ? t("common.saving") : t("band.logo.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPicked(null);
                setBackground(logo?.background ?? "light");
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

/** Light or dark background for the logo, as two radios. */
function BackgroundPicker({
  value,
  onChange,
  disabled,
}: {
  value: LogoBackground;
  onChange: (background: LogoBackground) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset
      disabled={disabled}
      className="inline-flex rounded-4xl bg-muted p-1 disabled:opacity-60"
    >
      <legend className="sr-only">{t("band.logo.background")}</legend>
      {LOGO_BACKGROUNDS.map((background) => (
        <label
          key={background}
          className={cn(
            "relative rounded-4xl px-3 py-1.5 font-medium text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
            background === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={background}
            checked={background === value}
            onChange={() => onChange(background)}
            // Invisible, over the whole label: a tap lands on the radio itself.
            className="absolute inset-0 cursor-pointer appearance-none rounded-4xl opacity-0"
          />
          {t(`band.logo.backgrounds.${background}`)}
        </label>
      ))}
    </fieldset>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sessionAvatarUrl, UserAvatar } from "@/components/user-avatar";
import { sessionQuery } from "@/lib/auth";
import { prepareAvatar } from "@/lib/avatar";
import { ensureOk, errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";

/**
 * The logged-in user's avatar (#60): pick a photo (the camera on phones), see the cropped result,
 * save it; or remove it to get the default back.
 */
export function AvatarCard({
  user,
}: {
  user: { id: string; name: string; image?: string | null | undefined };
}) {
  const { t } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [picked, setPicked] = useState<{ blob: Blob; url: string } | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const current = sessionAvatarUrl(user);

  // Frees the preview's object URL when it is replaced or the card goes away.
  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  async function refresh() {
    // The avatar shows in the header and in every band's lineup.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: ["bands"] }),
    ]);
    await router.invalidate();
  }

  const save = useMutation({
    mutationFn: async (blob: Blob) =>
      ensureOk(
        await fetch("/api/me/avatar", {
          method: "PUT",
          headers: { "content-type": blob.type },
          body: blob,
        }),
      ),
    onSuccess: async () => {
      setPicked(null);
      toast.success(t("account.avatar.saved"));
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async () => ensureOk(await fetch("/api/me/avatar", { method: "DELETE" })),
    onMutate: () => setUnreadable(false),
    onSuccess: async () => {
      toast.success(t("account.avatar.removed"));
      await refresh();
    },
  });

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again still triggers a change
    if (!file) return;
    save.reset();
    try {
      const blob = await prepareAvatar(file);
      setUnreadable(false);
      setPicked({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setUnreadable(true);
    }
  }

  const busy = save.isPending || remove.isPending;
  const error = unreadable
    ? t("errors.invalid_image")
    : save.isError
      ? errorMessage(t, save.error)
      : remove.isError
        ? errorMessage(t, remove.error)
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("account.avatar.title")}</CardTitle>
        <CardDescription>{t("account.avatar.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {picked ? (
          <img
            src={picked.url}
            alt={t("account.avatar.preview")}
            className="size-32 rounded-full object-cover ring-2 ring-border"
          />
        ) : (
          // What band mates see: the photo, or the default avatar.
          <div role="img" aria-label={t("account.avatar.current")}>
            <UserAvatar user={user} src={current} className="size-32 ring-2 ring-border" />
          </div>
        )}
        {error && (
          <p role="alert" className="text-center text-destructive text-sm">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="mt-6 flex-col items-stretch gap-2">
        {picked ? (
          <>
            <Button
              onClick={() => save.mutate(picked.blob)}
              disabled={!online || busy}
              pending={save.isPending}
            >
              {save.isPending ? t("account.avatar.saving") : t("account.avatar.save")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPicked(null);
                save.reset();
              }}
              disabled={busy}
            >
              {t("account.avatar.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button asChild disabled={!online || busy}>
              <label className="cursor-pointer">
                {current ? t("account.avatar.change") : t("account.avatar.choose")}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onPick}
                  disabled={!online || busy}
                />
              </label>
            </Button>
            {current && (
              <Button
                variant="outline"
                onClick={() => remove.mutate()}
                disabled={!online || busy}
                pending={remove.isPending}
              >
                {remove.isPending ? t("account.avatar.removing") : t("account.avatar.remove")}
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}

import { DEFAULT_LANGUAGE, isLanguage } from "@coverband/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
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
import { errorMessage } from "@/lib/errors";
import { useOnline } from "@/lib/online";
import { disablePush, enablePush, PushDeniedError, pushKeyQuery, pushStateQuery } from "@/lib/push";

/**
 * Push notifications on this device (#261): turned on or off here. Hidden where they can't work
 * (no push in this browser, the dev server, push off on the server).
 */
export function PushCard() {
  const { t, i18n } = useTranslation();
  // Offline, the app is read-only (#165).
  const online = useOnline();
  const queryClient = useQueryClient();
  const { data: publicKey } = useQuery(pushKeyQuery);
  const { data: state } = useQuery(pushStateQuery);
  const onSettled = () => queryClient.invalidateQueries({ queryKey: pushStateQuery.queryKey });
  const enable = useMutation({
    mutationFn: (key: string) =>
      enablePush(key, isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE),
    onSuccess: () => toast.success(t("account.push.enabled")),
    // Refused at the prompt: the card says they're blocked.
    onError: (error) => {
      if (!(error instanceof PushDeniedError)) toast.error(errorMessage(t, error));
    },
    onSettled,
  });
  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: () => toast.success(t("account.push.disabled")),
    onError: (error) => toast.error(errorMessage(t, error)),
    onSettled,
  });

  if (!publicKey || !state || state === "unsupported") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.push.title")}</CardTitle>
        <CardDescription>{t("account.push.description")}</CardDescription>
      </CardHeader>
      {state === "on" && <CardContent>{t("account.push.on")}</CardContent>}
      {state === "denied" && <CardContent>{t("account.push.denied")}</CardContent>}
      {state === "install" && <CardContent>{t("account.push.install")}</CardContent>}
      {state === "off" && (
        <CardFooter>
          <Button
            className="w-full"
            disabled={!online}
            pending={enable.isPending}
            onClick={() => enable.mutate(publicKey)}
          >
            <Bell />
            {t("account.push.enable")}
          </Button>
        </CardFooter>
      )}
      {state === "on" && (
        <CardFooter>
          <Button
            className="w-full"
            variant="outline"
            disabled={!online}
            pending={disable.isPending}
            onClick={() => disable.mutate()}
          >
            <BellOff />
            {t("account.push.disable")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

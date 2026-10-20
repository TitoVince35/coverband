import { APP_NAME } from "@coverband/shared";
import { Download, Share, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dismissInstall, promptInstall, useInstallMode } from "@/lib/install";

/** Offers to install the app (#166), on the home page, until it's installed or dismissed. */
export function InstallCard() {
  const { t } = useTranslation();
  const mode = useInstallMode();
  if (!mode) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {t("install.title", { appName: APP_NAME })}
        </CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("install.dismiss")}
            onClick={dismissInstall}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{t("install.why")}</p>
        {mode === "prompt" ? (
          <Button onClick={() => void promptInstall()}>
            <Download />
            {t("install.button")}
          </Button>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              {t("install.ios.share")}{" "}
              <Share className="inline size-4 align-text-bottom" aria-hidden />
            </li>
            <li>{t("install.ios.add")}</li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

import { useTranslation } from "react-i18next";
import { APP_BUILD, APP_VERSION, shortBuild } from "@/lib/build-info";
import { cn } from "@/lib/utils";

/** The running release, e.g. "Coverband Beta 0.1.0 (0012ca8)": on the login page (#147). */
export function AppVersion({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn("text-center text-muted-foreground text-xs", className)}>
      {t("common.appVersion", { version: APP_VERSION, build: shortBuild(APP_BUILD) })}
    </p>
  );
}

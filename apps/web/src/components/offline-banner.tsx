import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "@/lib/online";

/** Offline (#165): the saved data is shown, and changes are turned off until the connection is back. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="border-b bg-muted text-muted-foreground text-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <WifiOff className="size-4 shrink-0" aria-hidden />
        {t("offline.banner")}
      </div>
    </div>
  );
}

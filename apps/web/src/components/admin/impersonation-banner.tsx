import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sessionQuery } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { useStopImpersonating } from "@/lib/impersonation";
import { useOnline } from "@/lib/online";

/** An admin viewing the app as another user (#214): who, read-only, and the way back. */
export function ImpersonationBanner() {
  const { t } = useTranslation();
  const { data: session } = useQuery(sessionQuery);
  const stop = useStopImpersonating();
  // Offline, the app is read-only (#165): stopping needs the server.
  const online = useOnline();
  if (!session?.session.impersonatedBy) return null;
  return (
    <div
      role="status"
      className="border-b bg-amber-100 text-amber-950 text-sm dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <Eye className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {t("impersonation.banner", { name: session.user.name })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!online}
          pending={stop.isPending}
          onClick={() =>
            stop.mutate(undefined, { onError: (error) => toast.error(errorMessage(t, error)) })
          }
        >
          {t("impersonation.stop")}
        </Button>
      </div>
    </div>
  );
}

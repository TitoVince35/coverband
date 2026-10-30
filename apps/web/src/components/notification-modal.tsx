import { textParts } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { sessionQuery } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { notificationsQuery, useReadNotification } from "@/lib/notifications";
import { useOnline } from "@/lib/online";

/**
 * A note from the app's team (#260, kind `admin-modal`): shown over every page until the user
 * presses OK (no close button, Escape and taps outside do nothing), then the next unread one.
 * Never while an admin views the app as someone else: reading it would be a write.
 */
export function NotificationModal() {
  const { t } = useTranslation();
  const { data: session } = useQuery(sessionQuery);
  const impersonating = Boolean(session?.session.impersonatedBy);
  const { data: notes } = useQuery({ ...notificationsQuery, enabled: !impersonating });
  const read = useReadNotification();
  const online = useOnline();
  const note = impersonating ? undefined : notes?.[0];
  if (!note) return null;
  return (
    <AlertDialog open>
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`notifications.sender.${note.sender}`)}</AlertDialogTitle>
          <AlertDialogDescription className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap break-words text-left">
            {textParts(note.text).map((part, index) =>
              "url" in part ? (
                <a
                  // biome-ignore lint/suspicious/noArrayIndexKey: the parts never move.
                  key={index}
                  href={part.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  {part.url}
                </a>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: the parts never move.
                <span key={index}>{part.text}</span>
              ),
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            pending={read.isPending}
            disabled={!online}
            onClick={() =>
              read.mutate(note.id, { onError: (error) => toast.error(errorMessage(t, error)) })
            }
          >
            {t("notifications.ok")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

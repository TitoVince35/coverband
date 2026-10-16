import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

export type Invitation = {
  id: string;
  email: string;
  status: "pending" | "expired" | "accepted" | "revoked";
  expiresAt: string;
  invitedBy: string;
};

export type InvitationsListProps = {
  queryKey: readonly unknown[];
  list: () => Promise<Invitation[]>;
  resend: (id: string) => Promise<unknown>;
  revoke: (id: string) => Promise<unknown>;
};

/** Open invitations with resend and revoke. Used by the admin page and by band leaders. */
export function InvitationsList({
  queryKey,
  list,
  resend: resendOne,
  revoke: revokeOne,
}: InvitationsListProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const invitations = useQuery({ queryKey, queryFn: list });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const onError = (error: Error) => toast.error(errorMessage(t, error));

  const resend = useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => resendOne(id),
    onSuccess: (_res, { email }) => {
      toast.success(t("invitations.resent", { email }));
      void refresh();
    },
    onError,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeOne(id),
    onSuccess: () => {
      toast.success(t("invitations.revoked"));
      void refresh();
    },
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("invitations.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {invitations.isPending ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : invitations.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, invitations.error)}
          </p>
        ) : invitations.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("invitations.empty")}</p>
        ) : (
          <ul className="divide-y">
            {invitations.data.map((invitation) => {
              const expired = invitation.status === "expired";
              const date = formatDateTime(invitation.expiresAt, i18n.language);
              return (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{invitation.email}</span>
                      <Badge variant={expired ? "destructive" : "secondary"}>
                        {expired ? t("invitations.expired") : t("invitations.pending")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {expired
                        ? t("invitations.expiredOn", { date })
                        : t("invitations.expiresOn", { date })}
                      {" · "}
                      {t("invitations.invitedBy", { name: invitation.invitedBy })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate({ id: invitation.id, email: invitation.email })}
                    >
                      {t("invitations.resend")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          {t("invitations.revoke")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("invitations.revokeTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("invitations.revokeDescription", { email: invitation.email })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => revoke.mutate(invitation.id)}
                          >
                            {t("invitations.revoke")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

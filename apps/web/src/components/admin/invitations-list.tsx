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
import { adminInvitationsQuery } from "@/lib/admin";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

export function InvitationsList() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const invitations = useQuery(adminInvitationsQuery);

  const refresh = () => queryClient.invalidateQueries({ queryKey: adminInvitationsQuery.queryKey });
  const onError = (error: Error) => toast.error(errorMessage(t, error));

  const resend = useMutation({
    mutationFn: async ({ id }: { id: string; email: string }) =>
      ensureOk(await api.admin.invitations[":id"].resend.$post({ param: { id } })),
    onSuccess: (_res, { email }) => {
      toast.success(t("admin.invitations.resent", { email }));
      void refresh();
    },
    onError,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) =>
      ensureOk(await api.admin.invitations[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      toast.success(t("admin.invitations.revoked"));
      void refresh();
    },
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t("admin.invitations.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {invitations.isPending ? (
          <p className="text-muted-foreground text-sm">{t("admin.loading")}</p>
        ) : invitations.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(t, invitations.error)}
          </p>
        ) : invitations.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("admin.invitations.empty")}</p>
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
                        {expired ? t("admin.invitations.expired") : t("admin.invitations.pending")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {expired
                        ? t("admin.invitations.expiredOn", { date })
                        : t("admin.invitations.expiresOn", { date })}
                      {" · "}
                      {t("admin.invitations.invitedBy", { name: invitation.invitedBy })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate({ id: invitation.id, email: invitation.email })}
                    >
                      {t("admin.invitations.resend")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          {t("admin.invitations.revoke")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("admin.invitations.revokeTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("admin.invitations.revokeDescription", { email: invitation.email })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => revoke.mutate(invitation.id)}
                          >
                            {t("admin.invitations.revoke")}
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

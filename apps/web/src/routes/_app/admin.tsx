import { ADMIN_ROLE } from "@coverband/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { UsersList } from "@/components/admin/users-list";
import { InvitationsList } from "@/components/invitations/invitations-list";
import { InviteDialog } from "@/components/invitations/invite-dialog";
import {
  inviteLeader,
  leaderInvitationsKey,
  listLeaderInvitations,
  resendLeaderInvitation,
  revokeLeaderInvitation,
} from "@/lib/admin";

// Administration console, for application admins only: band leader invitations and users.
export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (context.user.role !== ADMIN_ROLE) {
      throw redirect({ to: "/" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1">
          <h1 className="font-bold text-2xl tracking-tight">{t("admin.title")}</h1>
          <p className="text-muted-foreground">{t("admin.description")}</p>
        </div>
        <InviteDialog
          label={t("admin.invite.new")}
          title={t("admin.invite.title")}
          description={t("admin.invite.description")}
          invite={inviteLeader}
          invalidates={leaderInvitationsKey}
        />
      </div>
      <InvitationsList
        queryKey={leaderInvitationsKey}
        list={listLeaderInvitations}
        resend={resendLeaderInvitation}
        revoke={revokeLeaderInvitation}
      />
      <UsersList />
    </section>
  );
}

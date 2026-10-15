import { ADMIN_ROLE } from "@coverband/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { InvitationsList } from "@/components/admin/invitations-list";
import { InviteLeaderForm } from "@/components/admin/invite-leader-form";
import { UsersList } from "@/components/admin/users-list";

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
      <div className="space-y-1">
        <h1 className="font-bold text-2xl tracking-tight">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.description")}</p>
      </div>
      <InviteLeaderForm />
      <InvitationsList />
      <UsersList />
    </section>
  );
}

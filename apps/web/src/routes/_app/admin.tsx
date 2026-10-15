import { ADMIN_ROLE } from "@coverband/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// Administration console, for application admins only (users and leader invitations come in #22).
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
    <section className="space-y-4">
      <h1 className="font-bold text-2xl tracking-tight">{t("admin.title")}</h1>
      <p className="text-muted-foreground">{t("admin.comingSoon")}</p>
    </section>
  );
}

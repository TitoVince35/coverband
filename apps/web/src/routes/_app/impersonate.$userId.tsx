import { ADMIN_ROLE } from "@coverband/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { adminUserQuery } from "@/lib/admin";
import { errorMessage } from "@/lib/errors";
import { useImpersonate } from "@/lib/impersonation";
import { useOnline } from "@/lib/online";

// The admin app's "View the app as this user" (#249) opens this page: impersonation sets the
// session on the host that asks for it, so the web app starts it, once confirmed (#214).
export const Route = createFileRoute("/_app/impersonate/$userId")({
  beforeLoad: ({ context }) => {
    if (context.user.role !== ADMIN_ROLE) {
      throw redirect({ to: "/" });
    }
  },
  component: ImpersonatePage,
});

function ImpersonatePage() {
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const user = useQuery(adminUserQuery(userId));
  const impersonate = useImpersonate();
  const online = useOnline();

  if (user.isPending) return <ListSkeleton />;
  if (user.isError) {
    return (
      <p role="alert" className="text-destructive">
        {errorMessage(t, user.error)}
      </p>
    );
  }
  const { name, impersonateUrl } = user.data;
  return (
    <section className="mx-auto max-w-md space-y-4 py-8 text-center">
      {impersonateUrl ? (
        <>
          <h1 className="font-bold text-2xl tracking-tight">
            {t("impersonation.confirmTitle", { name })}
          </h1>
          <p className="text-muted-foreground">{t("impersonation.confirmText")}</p>
          <Button
            disabled={!online || impersonate.isPending}
            pending={impersonate.isPending}
            onClick={() =>
              impersonate.mutate(userId, {
                onError: (error) => toast.error(errorMessage(t, error)),
              })
            }
          >
            <Eye />
            {t("impersonation.confirm", { name })}
          </Button>
        </>
      ) : (
        <p role="alert" className="text-muted-foreground">
          {t("impersonation.notAllowed")}
        </p>
      )}
      <p>
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          {t("impersonation.cancel")}
        </Link>
      </p>
    </section>
  );
}

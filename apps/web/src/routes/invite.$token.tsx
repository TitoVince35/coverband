import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LeaderWizard } from "@/components/onboarding/leader-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import i18n, { readStoredLanguage } from "@/i18n";
import { isLanguage } from "@/i18n/languages";
import { api } from "@/lib/api";
import { authClient, sessionQuery } from "@/lib/auth";
import { ensureOk, errorMessage } from "@/lib/errors";

// Public page opened from an invitation email. The token in the URL is the proof.
export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

const invitationQuery = (token: string) => ({
  queryKey: ["invitation", token],
  queryFn: async () =>
    (await ensureOk(await api.invitations[":token"].$get({ param: { token } }))).json(),
  retry: false,
});

function InvitePage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const invitation = useQuery(invitationQuery(token));
  const session = useQuery(sessionQuery);
  const language = invitation.data?.language;

  // Show the wizard in the invitation's language, unless this device has an explicit choice.
  useEffect(() => {
    if (language && isLanguage(language) && !readStoredLanguage()) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  if (invitation.isPending || session.isPending) {
    return <Shell title={t("invite.loading")} />;
  }
  if (invitation.isError) {
    return (
      <Shell title={t("invite.unavailable")} description={errorMessage(t, invitation.error)}>
        <Button asChild variant="outline">
          <Link to="/login">{t("invite.goToLogin")}</Link>
        </Button>
      </Shell>
    );
  }

  const { email, role, inviterName, hasAccount } = invitation.data;
  const current = session.data?.user.email;
  const loginPath = `/invite/${token}`;

  if (role !== "leader") {
    return <Shell title={t("invite.unavailable")} description={t("invite.musicianSoon")} />;
  }
  if (current && current !== email) {
    return (
      <Shell title={t("invite.title")} description={t("invite.wrongAccount", { email, current })}>
        <Button
          variant="outline"
          onClick={async () => {
            await authClient.signOut();
            queryClient.setQueryData(sessionQuery.queryKey, null);
            await invitation.refetch();
          }}
        >
          {t("invite.logout")}
        </Button>
      </Shell>
    );
  }
  if (hasAccount && !current) {
    return (
      <Shell title={t("invite.title")} description={t("invite.hasAccount", { email })}>
        <Button asChild>
          <Link to="/login" search={{ redirect: loginPath }}>
            {t("invite.login")}
          </Link>
        </Button>
      </Shell>
    );
  }

  return (
    <LeaderWizard token={token} email={email} inviterName={inviterName} newAccount={!hasAccount} />
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="mx-auto mt-4 max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardFooter>{children}</CardFooter>}
    </Card>
  );
}

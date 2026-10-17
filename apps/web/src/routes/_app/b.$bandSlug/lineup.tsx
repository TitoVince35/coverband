import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { InvitationsList } from "@/components/invitations/invitations-list";
import { InviteDialog } from "@/components/invitations/invite-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { bandInvitations, bandQuery, membersQuery } from "@/lib/bands";
import { errorMessage } from "@/lib/errors";

// Lineup: every member with their instrument and role. The band leader also invites musicians.
export const Route = createFileRoute("/_app/b/$bandSlug/lineup")({
  component: LineupPage,
});

function LineupPage() {
  const { t } = useTranslation();
  const { bandSlug } = Route.useParams();
  const { user } = Route.useRouteContext();
  const band = useQuery(bandQuery(bandSlug));
  const members = useQuery(membersQuery(bandSlug));
  const isLeader = band.data?.membership.role === "leader";
  const invitations = bandInvitations(bandSlug);

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="flex-1 font-heading font-semibold text-lg">{t("lineup.title")}</h2>
        {isLeader && band.data && (
          <InviteDialog
            label={t("lineup.invite.new")}
            title={t("lineup.invite.title")}
            description={t("lineup.invite.description", { band: band.data.band.name })}
            invite={invitations.invite}
            invalidates={invitations.queryKey}
          />
        )}
      </div>
      <Card>
        <CardContent>
          {members.isPending ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : members.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(t, members.error)}
            </p>
          ) : (
            <ul className="divide-y">
              {members.data.map((member) => {
                const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ");
                return (
                  <li key={member.userId} className="flex items-center gap-3 py-3">
                    <UserAvatar
                      user={{ id: member.userId, name: member.name }}
                      src={member.avatarUrl}
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{member.name}</span>
                        {member.userId === user.id && (
                          <span className="text-muted-foreground text-xs">({t("lineup.you")})</span>
                        )}
                        {member.role === "leader" && <Badge>{t("band.roles.leader")}</Badge>}
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {member.instrument}
                        {fullName && fullName !== member.name && ` · ${fullName}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {isLeader && (
        <InvitationsList
          queryKey={invitations.queryKey}
          list={invitations.list}
          resend={invitations.resend}
          revoke={invitations.revoke}
        />
      )}
    </section>
  );
}

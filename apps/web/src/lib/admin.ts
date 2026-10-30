import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

// The admin console's users, oldest first: the admin app's page (#249), as many as it gives at once.
// This page leaves the web app with #250.
export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: async () =>
    (
      await (
        await ensureOk(await api.admin.users.$get({ query: { sort: "createdAt", perPage: "100" } }))
      ).json()
    ).data,
});

/** One user, as the admin app's page shows them (#249): the impersonation page's name and check. */
export const adminUserQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "users", id],
    queryFn: async () =>
      (await (await ensureOk(await api.admin.users[":id"].$get({ param: { id } }))).json()).data,
  });

export const listLeaderInvitations = async () =>
  (await (await ensureOk(await api.admin.invitations.$get())).json()).invitations;

export const leaderInvitationsKey = ["admin", "invitations"] as const;

export const resendLeaderInvitation = async (id: string) =>
  ensureOk(await api.admin.invitations[":id"].resend.$post({ param: { id } }));

export const revokeLeaderInvitation = async (id: string) =>
  ensureOk(await api.admin.invitations[":id"].$delete({ param: { id } }));

export const inviteLeader = async (json: { email: string; language: "en" | "fr" }) =>
  ensureOk(await api.admin.invitations.$post({ json }));

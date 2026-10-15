import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: async () => (await (await ensureOk(await api.admin.users.$get())).json()).users,
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

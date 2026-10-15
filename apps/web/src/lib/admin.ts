import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: async () => (await (await ensureOk(await api.admin.users.$get())).json()).users,
});

export const adminInvitationsQuery = queryOptions({
  queryKey: ["admin", "invitations"],
  queryFn: async () =>
    (await (await ensureOk(await api.admin.invitations.$get())).json()).invitations,
});

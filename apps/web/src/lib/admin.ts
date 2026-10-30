import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

/** One user, as the admin app shows them (#249): the impersonation page's name and check. */
export const adminUserQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "users", id],
    queryFn: async () =>
      (await (await ensureOk(await api.admin.users[":id"].$get({ param: { id } }))).json()).data,
  });

import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

export const myBandsQuery = queryOptions({
  queryKey: ["bands"],
  queryFn: async () => (await (await ensureOk(await api.bands.$get())).json()).bands,
});

export const bandQuery = (bandSlug: string) =>
  queryOptions({
    queryKey: ["bands", bandSlug],
    queryFn: async () =>
      (await ensureOk(await api.bands[":bandSlug"].$get({ param: { bandSlug } }))).json(),
  });

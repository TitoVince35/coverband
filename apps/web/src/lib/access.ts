import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

/** Whether this device needs the beta access code (#148), and has given it. */
export const accessQuery = queryOptions({
  queryKey: ["access"],
  queryFn: async () => (await ensureOk(await api.access.$get())).json(),
});

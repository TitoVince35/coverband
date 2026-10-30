import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

/**
 * The user's unread notifications (#260), oldest first. Checked again when the app comes back to
 * the foreground once a minute old: a note sent meanwhile shows without restarting the app. Not
 * kept offline: reading one needs the server.
 */
export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  staleTime: 60 * 1000,
  refetchOnWindowFocus: true,
  queryFn: async () =>
    (await (await ensureOk(await api.notifications.$get())).json()).notifications,
});

/** Marks a notification read, on every device of the user: the next one, if any, shows. */
export function useReadNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.notifications[":id"].read.$post({ param: { id } }));
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData(notificationsQuery.queryKey, (notes) =>
        notes?.filter((note) => note.id !== id),
      );
    },
  });
}

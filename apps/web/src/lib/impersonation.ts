// An admin viewing the app as another user, read-only (#214): Better Auth's admin plugin switches
// the session to the user's, then back.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { authClient, ensureAuthOk, sessionQuery } from "@/lib/auth";
import { removeUserQueries } from "@/lib/query-client";

/** Switches to another account's session (home page): the previous one's data is forgotten, like a login. */
function useSwitchSession<T>(switchSession: (variables: T) => Promise<void>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: switchSession,
    onSuccess: async () => {
      removeUserQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      await router.navigate({ to: "/" });
    },
  });
}

/** Starts viewing the app as the user: their home page opens. */
export function useImpersonate() {
  return useSwitchSession(async (userId: string) => {
    ensureAuthOk(await authClient.admin.impersonateUser({ userId }));
  });
}

/** Back to the admin's own session, on their home page (the admin console is its own app, #250). */
export function useStopImpersonating() {
  return useSwitchSession(stopImpersonating);
}

export async function stopImpersonating() {
  ensureAuthOk(await authClient.admin.stopImpersonating());
}

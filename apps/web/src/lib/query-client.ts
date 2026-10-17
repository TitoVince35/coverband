import { QueryClient } from "@tanstack/react-query";

/**
 * How long fetched data counts as fresh. Serverless SQL Database is billed per minute awake and
 * each query wakes it for at least 5 minutes, while a PWA on a phone comes back to the foreground
 * all the time: within this window, focus and reconnect don't refetch. Mutations invalidate what
 * they change, so the user's own changes still show at once.
 */
export const STALE_TIME = 5 * 60 * 1000;

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: STALE_TIME } } });
}

/** Query key of the current session (`sessionQuery` in `@/lib/auth`). */
export const SESSION_KEY = ["session"] as const;

/**
 * Forgets everything cached for the previous user (bands, lineups...) but the session, so another
 * account logging in on this device never sees it, even within the fresh window.
 */
export function removeUserQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
}

/** After a logout (or every session revoked): no session and no cached user data. */
export function clearUserData(queryClient: QueryClient) {
  queryClient.setQueryData(SESSION_KEY, null);
  removeUserQueries(queryClient);
}

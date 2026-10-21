import {
  type FetchQueryOptions,
  onlineManager,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { clearOfflineCache } from "@/lib/offline-cache";
import { clearSavedLogos } from "@/lib/offline-logos";

/**
 * How long fetched data counts as fresh. Serverless SQL Database is billed per minute awake and
 * each query wakes it for at least 5 minutes, while a PWA on a phone comes back to the foreground
 * all the time: within this window, focus and reconnect don't refetch. Mutations invalidate what
 * they change, so the user's own changes still show at once.
 */
export const STALE_TIME = 5 * 60 * 1000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Kept in memory for the app's life (#165): the offline copy saves what's in memory, for up
      // to OFFLINE_MAX_AGE_MS. Not that duration itself: above ~24.8 days, setTimeout overflows
      // and unused queries would be dropped at once.
      queries: { staleTime: STALE_TIME, gcTime: Number.POSITIVE_INFINITY },
      // Offline, a change fails at once ("offline or server down") instead of waiting to be sent
      // later over data that may have changed meanwhile: the app is read-only offline.
      mutations: { networkMode: "always" },
    },
  });
}

/** When this page's app started: data updated since then came from the server, not the saved copy. */
const APP_STARTED_AT = Date.now();

/**
 * What a route guard reads (the session, the access code): online, the server's answer, reused
 * while fresh; offline, or when the server can't be reached (a venue's Wi-Fi), the saved copy
 * (#165), or undefined without one. Never a fetch waiting for the connection: a blank page.
 *
 * Stale data the server gave since the app started is answered at once and checked again in the
 * background (#211): guards run on every navigation, and waiting for a sleeping database would
 * freeze the page shown. `watchGuardData` runs the guards again when the answer changes.
 */
export async function guardData<T, K extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, K>,
): Promise<T | undefined> {
  const saved = () => queryClient.getQueryData<T>(options.queryKey);
  if (!onlineManager.isOnline()) return saved();
  const state = queryClient.getQueryState<T>(options.queryKey);
  if (state?.data !== undefined && state.dataUpdatedAt >= APP_STARTED_AT) {
    // Fresh, nothing is fetched; stale, the answer comes later (an unreachable server keeps it).
    void queryClient.fetchQuery({ ...options, retry: false }).catch(() => {});
    return state.data;
  }
  try {
    return await queryClient.fetchQuery({ ...options, retry: false });
  } catch (error) {
    const data = saved();
    if (data === undefined) throw error;
    return data;
  }
}

/**
 * Calls `onChange` when the data of one of these queries changes (a background check of
 * `guardData` found the user logged out, or a new access code): the router runs its guards again.
 */
export function watchGuardData(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
  onChange: () => void,
) {
  const last = new Map(keys.map((key) => [JSON.stringify(key), queryClient.getQueryData(key)]));
  return queryClient.getQueryCache().subscribe((event) => {
    const key = JSON.stringify(event.query.queryKey);
    if (event.type !== "updated" || !last.has(key)) return;
    const data = event.query.state.data;
    const before = last.get(key);
    last.set(key, data);
    // Same answer, same object (structural sharing); a first answer: the guards are waiting for it.
    if (before !== undefined && before !== data) onChange();
  });
}

/** Query key of the current session (`sessionQuery` in `@/lib/auth`). */
export const SESSION_KEY = ["session"] as const;

/**
 * Forgets everything cached for the previous user (bands, lineups...) but the session, so another
 * account logging in on this device never sees it, even within the fresh window.
 */
export function removeUserQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
  // And the band logos saved for offline use (#178).
  void clearSavedLogos();
}

/** After a logout (or every session revoked): no session and no cached user data. */
export function clearUserData(queryClient: QueryClient) {
  queryClient.setQueryData(SESSION_KEY, null);
  removeUserQueries(queryClient);
  // The saved copy would follow within a second; a closed app might not wait.
  void clearOfflineCache();
}

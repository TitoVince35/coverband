// The data kept on the device for offline use (#165): the user's bands, each band's page and
// lineup, the whole repertoire with lyrics and links. TanStack Query's cache is saved in IndexedDB
// and restored at startup; nothing from /api goes through the service worker (per-user data that
// would survive a logout). The cache follows the user: logging out or in as someone else empties
// it, so the saved copy is emptied too.

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { APP_BUILD } from "./build-info";

/** Saved data older than this is dropped at startup. */
export const OFFLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DB_NAME = "coverband";
const STORE = "query-cache";
const KEY = "client";

/** Which queries are saved: what the app needs to read a band offline. Never invitations (emails). */
export function isKeptOffline(queryKey: QueryKey) {
  const [root, , section, , extra] = queryKey;
  if (root === "session" || root === "access") return true;
  if (root !== "bands") return false;
  // Lyrics searches (["bands", slug, "songs", id, "lyrics-search", ...]) and invitations stay out.
  return section !== "invitations" && extra === undefined;
}

/** Saves wait this long, so a burst of changes (a band's whole repertoire) is one write. */
const SAVE_DELAY_MS = 500;

let database: Promise<IDBDatabase> | undefined;

/** One connection for the app's life: writes stay in order. */
function openStore() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openStore();
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function failed(error: unknown) {
  // No offline copy this time; the app works on.
  console.warn("Offline copy not saved", error);
}

let latest: PersistedClient | undefined;
let saving: ReturnType<typeof setTimeout> | undefined;

/** Writes the pending save now (the page is being hidden or closed). */
function saveNow() {
  clearTimeout(saving);
  saving = undefined;
  const client = latest;
  latest = undefined;
  if (client) run("readwrite", (store) => store.put(client, KEY)).catch(failed);
}

/**
 * The cache in IndexedDB (structured clone: no JSON round trip). Saves are delayed and keep only
 * the latest state; failures only mean no offline copy.
 */
const indexedDbPersister: Persister = {
  persistClient: (client: PersistedClient) => {
    latest = client;
    saving ??= setTimeout(saveNow, SAVE_DELAY_MS);
  },
  restoreClient: async () =>
    (await run<PersistedClient | undefined>("readonly", (store) => store.get(KEY)).catch(
      () => undefined,
    )) ?? undefined,
  removeClient: async () => {
    clearTimeout(saving);
    saving = undefined;
    latest = undefined;
    await run("readwrite", (store) => store.delete(KEY)).catch(failed);
  },
};

/**
 * Restores the saved cache, then keeps saving it. Resolves once restored, so the first page
 * (and its session check) sees the saved data when offline. Another build drops it: the data's
 * shape may have changed.
 */
export async function startOfflineCache(queryClient: QueryClient) {
  if (typeof indexedDB === "undefined") return;
  const [, restored] = persistQueryClient({
    queryClient,
    persister: indexedDbPersister,
    maxAge: OFFLINE_MAX_AGE_MS,
    buster: APP_BUILD,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && isKeptOffline(query.queryKey),
    },
  });
  await restored.catch(() => {});
  // Whatever was saved may be out of date: online, pages fetch it again as they open (as without
  // a saved copy); offline, they show it.
  await queryClient.invalidateQueries({ refetchType: "none" });
  addEventListener("pagehide", saveNow);
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });
}

/** Empties the saved copy at once (logout), without waiting for the next save. */
export function clearOfflineCache() {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return indexedDbPersister.removeClient();
}

import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { focusManager, onlineManager, QueryObserver } from "@tanstack/react-query";
import {
  clearUserData,
  createQueryClient,
  removeUserQueries,
  SESSION_KEY,
  STALE_TIME,
} from "./query-client";

/** Watches a query like a mounted component does, counting fetches. */
async function watched() {
  const client = createQueryClient();
  // As QueryClientProvider does: listen to focus and network changes.
  client.mount();
  let fetches = 0;
  const observer = new QueryObserver(client, {
    queryKey: ["bands"],
    queryFn: async () => ++fetches,
  });
  const unsubscribe = observer.subscribe(() => {});
  await Bun.sleep(1);
  return {
    fetches: () => fetches,
    stop: () => {
      unsubscribe();
      client.unmount();
    },
  };
}

/** The app going to the background and back, or offline and back. */
async function comeBack() {
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await Bun.sleep(1);
}

describe("query client", () => {
  afterEach(() => {
    setSystemTime();
    focusManager.setFocused(undefined);
  });

  test("focus and reconnect don't refetch fresh data", async () => {
    const query = await watched();
    expect(query.fetches()).toBe(1);
    await comeBack();
    expect(query.fetches()).toBe(1);
    query.stop();
  });

  test("once stale, coming back refetches", async () => {
    const query = await watched();
    setSystemTime(new Date(Date.now() + STALE_TIME + 1000));
    await comeBack();
    expect(query.fetches()).toBe(2);
    query.stop();
  });
});

describe("switching users", () => {
  function cached() {
    const client = createQueryClient();
    client.setQueryData(SESSION_KEY, { user: { id: "u1" } });
    client.setQueryData(["bands"], ["first user's band"]);
    client.setQueryData(["bands", "slug", "members"], []);
    return client;
  }

  test("removeUserQueries keeps only the session (refetched after a login)", () => {
    const client = cached();
    removeUserQueries(client);
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([[...SESSION_KEY]]);
  });

  test("clearUserData also empties the session", () => {
    const client = cached();
    clearUserData(client);
    expect(client.getQueryData(SESSION_KEY)).toBeNull();
    expect(client.getQueryData(["bands"])).toBeUndefined();
  });
});

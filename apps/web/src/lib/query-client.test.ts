import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { focusManager, onlineManager, QueryObserver } from "@tanstack/react-query";
import {
  clearUserData,
  createQueryClient,
  guardData,
  removeUserQueries,
  SESSION_KEY,
  STALE_TIME,
  watchGuardData,
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

describe("guardData", () => {
  const saved = { user: "lea" };
  const options = (queryFn: () => Promise<unknown>) => ({ queryKey: ["session"], queryFn });

  afterEach(() => onlineManager.setOnline(true));

  test("online: the server's answer", async () => {
    const client = createQueryClient();
    client.setQueryData(["session"], saved, { updatedAt: 0 });
    expect(
      await guardData(
        client,
        options(async () => ({ user: "max" })),
      ),
    ).toEqual({ user: "max" });
  });

  test("offline: the saved copy, without asking the server (#165)", async () => {
    onlineManager.setOnline(false);
    const client = createQueryClient();
    client.setQueryData(["session"], saved);
    let asked = false;
    const result = await guardData(
      client,
      options(async () => {
        asked = true;
        return null;
      }),
    );
    expect(result).toEqual(saved);
    expect(asked).toBe(false);
    expect(
      await guardData(
        createQueryClient(),
        options(async () => null),
      ),
    ).toBeUndefined();
  });

  test("a server that can't be reached: the saved copy, or the error without one", async () => {
    const client = createQueryClient();
    client.setQueryData(["session"], saved, { updatedAt: 0 });
    const unreachable = options(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await guardData(client, unreachable)).toEqual(saved);
    expect(guardData(createQueryClient(), unreachable)).rejects.toThrow("Failed to fetch");
  });

  test("stale data from the server since the app started: at once, checked again behind (#211)", async () => {
    const client = createQueryClient();
    client.setQueryData(["session"], saved);
    setSystemTime(new Date(Date.now() + STALE_TIME + 1000));
    const changes: number[] = [];
    watchGuardData(client, [["session"]], () => changes.push(1));
    let answer: (value: unknown) => void = () => {};
    const sleeping = options(() => new Promise((resolve) => (answer = resolve)));
    // The server hasn't answered yet: the guard doesn't wait for it.
    expect(await guardData(client, sleeping)).toEqual(saved);
    // It answers: logged out elsewhere, so the guards run again.
    answer(null);
    await Bun.sleep(1);
    expect(client.getQueryData(["session"])).toBeNull();
    expect(changes).toHaveLength(1);
    setSystemTime();
  });

  test("watchGuardData: the same answer or a first one runs nothing again", async () => {
    const client = createQueryClient();
    const changes: number[] = [];
    watchGuardData(client, [["session"], ["access"]], () => changes.push(1));
    client.setQueryData(["access"], { granted: true });
    client.setQueryData(["access"], { granted: true });
    client.setQueryData(["bands"], [1]);
    client.setQueryData(["bands"], [2]);
    expect(changes).toHaveLength(0);
    client.setQueryData(["access"], { granted: false });
    expect(changes).toHaveLength(1);
  });
});

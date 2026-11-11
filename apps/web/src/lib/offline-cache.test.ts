import { describe, expect, test } from "bun:test";
import { ApiRequestError } from "./errors";
import { isKeptOffline, isSaved, savedCopy } from "./offline-cache";

describe("isKeptOffline", () => {
  test("keeps the session, the access check and what a band's pages read", () => {
    for (const key of [
      ["session"],
      ["access"],
      ["bands"],
      ["bands", "the-rockers"],
      ["bands", "the-rockers", "members"],
      ["bands", "the-rockers", "activity"],
      ["bands", "the-rockers", "songs"],
      ["bands", "the-rockers", "songs", "archived"],
      ["bands", "the-rockers", "songs", "6f1c0d1e-0000-4000-8000-000000000000"],
    ]) {
      expect(isKeptOffline(key)).toBe(true);
    }
  });

  test("never invitations (emails), lyrics searches or other data", () => {
    for (const key of [
      ["bands", "the-rockers", "invitations"],
      ["bands", "the-rockers", "songs", "6f1c", "lyrics-search", null],
      ["admin", "users"],
      ["instruments", "suggestions"],
      ["invitation", "token"],
    ]) {
      expect(isKeptOffline(key)).toBe(false);
    }
  });
});

describe("saving a failed refetch (#281)", () => {
  const queryKey = ["bands", "the-rockers", "setlists"];
  const state = {
    data: [{ id: "s1" }],
    dataUpdatedAt: 1,
    dataUpdateCount: 1,
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: "success" as const,
    fetchStatus: "idle" as const,
  };
  const failed = (error: Error) => ({
    ...state,
    status: "error" as const,
    error,
    errorUpdatedAt: 2,
    fetchFailureCount: 4,
    fetchFailureReason: error,
  });

  test("kept with its data when the connection failed, not when the server refused", () => {
    expect(isSaved({ queryKey, state })).toBe(true);
    expect(isSaved({ queryKey, state: failed(new TypeError("Failed to fetch")) })).toBe(true);
    expect(isSaved({ queryKey, state: failed(new ApiRequestError("not_found", "Gone")) })).toBe(
      false,
    );
    expect(isSaved({ queryKey, state: { ...failed(new TypeError("x")), data: undefined } })).toBe(
      false,
    );
    expect(isSaved({ queryKey: ["bands", "x", "invitations"], state })).toBe(false);
  });

  test("saved as its data, without the error", () => {
    const error = new TypeError("Failed to fetch");
    const query = { queryKey, queryHash: "h", dehydratedAt: 2, state: failed(error) };
    const saved = savedCopy({
      timestamp: 1,
      buster: "b",
      clientState: { mutations: [], queries: [query] },
    });
    const [copy] = saved.clientState.queries;
    expect(copy?.state).toMatchObject({ status: "success", error: null, fetchFailureReason: null });
    expect(copy?.state.data).toEqual([{ id: "s1" }]);
    // The query itself is untouched.
    expect(query.state.error).toBe(error);
  });
});

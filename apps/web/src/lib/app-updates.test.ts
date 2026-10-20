import { describe, expect, test } from "bun:test";
import {
  claimLoadErrorReload,
  LOAD_ERROR_RELOAD_WINDOW_MS,
  shouldReloadForBuild,
} from "./app-updates";

function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("shouldReloadForBuild", () => {
  test("reloads when the server runs another build, once per build", () => {
    expect(shouldReloadForBuild("new", "old", null)).toBe(true);
    expect(shouldReloadForBuild("new", "old", "new")).toBe(false);
    expect(shouldReloadForBuild("newer", "old", "new")).toBe(true);
  });

  test("not when the builds match or the server can't be reached", () => {
    expect(shouldReloadForBuild("same", "same", null)).toBe(false);
    expect(shouldReloadForBuild(null, "old", null)).toBe(false);
  });
});

describe("claimLoadErrorReload", () => {
  test("reloads after a page's code fails to load, but not twice in a row", () => {
    const store = memoryStore();
    expect(claimLoadErrorReload(store, 1_000_000)).toBe(true);
    expect(claimLoadErrorReload(store, 1_000_000 + LOAD_ERROR_RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(claimLoadErrorReload(store, 1_000_000 + LOAD_ERROR_RELOAD_WINDOW_MS)).toBe(true);
  });
});

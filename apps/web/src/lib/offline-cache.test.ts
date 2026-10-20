import { describe, expect, test } from "bun:test";
import { isKeptOffline } from "./offline-cache";

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

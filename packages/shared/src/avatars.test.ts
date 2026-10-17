import { expect, test } from "bun:test";
import { avatarUrl } from "./avatars";

test("avatarUrl is versioned by the storage key, null without an image", () => {
  expect(avatarUrl("u1", "users/u1/avatar/abc-123.webp")).toBe("/api/users/u1/avatar?v=abc-123");
  expect(avatarUrl("u1", null)).toBeNull();
  expect(avatarUrl("u1", undefined)).toBeNull();
});

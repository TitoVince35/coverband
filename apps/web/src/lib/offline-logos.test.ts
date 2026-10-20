import { expect, test } from "bun:test";
import { OFFLINE_MAX_AGE_MS } from "./offline-cache";
import { isUpToDate } from "./offline-logos";

test("isUpToDate: the same logo (same versioned URL), saved less than 30 days ago", () => {
  const saved = { url: "/api/bands/b/logo?v=1", blob: new Blob(), savedAt: 1_000 };
  expect(isUpToDate(saved, "/api/bands/b/logo?v=1", 2_000)).toBe(true);
  // Replaced: another version.
  expect(isUpToDate(saved, "/api/bands/b/logo?v=2", 2_000)).toBe(false);
  expect(isUpToDate(saved, "/api/bands/b/logo?v=1", 1_000 + OFFLINE_MAX_AGE_MS)).toBe(false);
  expect(isUpToDate(undefined, "/api/bands/b/logo?v=1", 2_000)).toBe(false);
});

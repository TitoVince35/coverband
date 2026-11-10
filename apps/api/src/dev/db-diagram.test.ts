import { describe, expect, test } from "bun:test";
import { databaseDot, timestampPrefix } from "./db-diagram";

describe("timestampPrefix", () => {
  test("is YYmmddhhmm in local time", () => {
    expect(timestampPrefix(new Date(2026, 10, 10, 15, 30))).toBe("2611101530");
    expect(timestampPrefix(new Date(2027, 0, 2, 3, 4))).toBe("2701020304");
  });
});

describe("databaseDot", () => {
  const dot = databaseDot();

  test("draws every module's tables with snake_case columns", () => {
    expect(dot).toContain('subgraph "cluster_songs"');
    expect(dot).toContain('"songs" [label=');
    expect(dot).toContain('PORT="band_id"');
  });

  test("draws foreign keys with their delete rule", () => {
    expect(dot).toContain('"bands":"id":e -> "songs":"band_id":w [label="cascade"];');
  });
});

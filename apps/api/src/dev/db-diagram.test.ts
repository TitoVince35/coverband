import { describe, expect, test } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../core/db/schema";
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

  test("draws every table of the schema, each module in its own colour", () => {
    const tables = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((table) => getTableConfig(table).name);
    expect(tables).toContain("setlists");
    for (const table of tables) expect(dot).toContain(`"${table}" [label=`);
    const fills = [...dot.matchAll(/fillcolor="(#[0-9a-f]{6})"/g)].map((match) => match[1]);
    expect(new Set(fills).size).toBe(fills.length);
  });

  test("draws foreign keys with their delete rule", () => {
    expect(dot).toContain('"bands":"id":e -> "songs":"band_id":w [label="cascade"];');
  });
});

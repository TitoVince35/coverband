import { describe, expect, test } from "bun:test";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  test("accepts a postgres URL", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db" });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
  });

  test("rejects a missing or non-postgres URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: "https://example.com" })).toThrow(/DATABASE_URL/);
  });
});

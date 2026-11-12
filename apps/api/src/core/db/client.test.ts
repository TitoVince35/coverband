import { afterAll, describe, expect, test } from "bun:test";
import { sql as rawSql } from "drizzle-orm";
import { createDb, IDLE_TIMEOUT_SECONDS } from "./client";

// Integration test: needs the local Postgres (`bun run db:up`). Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("database client", () => {
  const { db, sql } = createDb(databaseUrl ?? "");

  afterAll(() => sql.end());

  test("unused connections close before the serverless database's own idle cut", () => {
    expect(sql.options.idle_timeout).toBe(IDLE_TIMEOUT_SECONDS);
    expect(IDLE_TIMEOUT_SECONDS).toBeLessThan(60);
  });

  test("connects and runs a query", async () => {
    const rows = await db.execute<{ one: number }>(rawSql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });
});

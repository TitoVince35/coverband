import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Seconds before an unused connection is closed. Scaleway's Serverless SQL Database closes every
 * connection when it goes to sleep (after a few idle minutes): one kept open meanwhile would
 * fail the next query with CONNECTION_CLOSED, a 500 for the member.
 */
export const IDLE_TIMEOUT_SECONDS = 20;

/**
 * Creates the database client. Prepared statements are disabled because
 * Scaleway Serverless SQL Database sits behind a transaction-mode connection pooler.
 */
export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    prepare: false,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>["db"];

/** A transaction, as passed to the `db.transaction` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

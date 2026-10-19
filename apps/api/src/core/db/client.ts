import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Creates the database client. Prepared statements are disabled because
 * Scaleway Serverless SQL Database sits behind a transaction-mode connection pooler.
 */
export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { prepare: false, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>["db"];

/** A transaction, as passed to the `db.transaction` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

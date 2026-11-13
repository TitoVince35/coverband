import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type Logger, silentLogger } from "../log";
import * as schema from "./schema";

/**
 * Seconds before an unused connection is closed. Scaleway's Serverless SQL Database closes every
 * connection when it goes to sleep (after a few idle minutes): one kept open meanwhile would
 * fail the next query with CONNECTION_CLOSED, a 500 for the member.
 */
export const IDLE_TIMEOUT_SECONDS = 20;

/** What a client or one of its transactions carries: its logger, and what waits for the commit. */
type Context = { log: Logger; afterCommit?: (() => void)[] };

const contexts = new WeakMap<object, Context>();

/**
 * Creates the database client. Prepared statements are disabled because
 * Scaleway Serverless SQL Database sits behind a transaction-mode connection pooler.
 * `log` gets what is logged about the client's writes (`afterCommit`, `dbLog`).
 */
export function createDb(databaseUrl: string, { log = silentLogger }: { log?: Logger } = {}) {
  const sql = postgres(databaseUrl, {
    prepare: false,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  contexts.set(db, { log });

  // postgres.js has no "after commit" hook: the transaction keeps a queue, run once it commits.
  const transaction = db.transaction.bind(db);
  db.transaction = (async (run, config) => {
    const afterCommit: (() => void)[] = [];
    const result = await transaction((tx) => {
      contexts.set(tx, { log, afterCommit });
      return run(tx);
    }, config);
    for (const job of afterCommit) job();
    return result;
  }) as typeof db.transaction;

  return { db, sql };
}

export type Db = ReturnType<typeof createDb>["db"];

/** A transaction, as passed to the `db.transaction` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `job` once `tx` has committed: never if it rolls back. Outside a transaction (the client
 * itself, whose statements commit on their own), right away. A nested transaction (savepoint)
 * isn't tracked: its jobs run right away, so don't call this inside one.
 */
export function afterCommit(tx: Db | Tx, job: () => void) {
  const queue = contexts.get(tx)?.afterCommit;
  if (queue) queue.push(job);
  else job();
}

/** The logger given to `createDb` for this client or one of its transactions. */
export function dbLog(tx: Db | Tx): Logger {
  return contexts.get(tx)?.log ?? silentLogger;
}

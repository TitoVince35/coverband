// Applies pending migrations from ./drizzle. Run locally with `bun run db:migrate`,
// and before starting the app on deploy (no drizzle-kit needed in production).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadDatabaseEnv, loadLogEnv, logConfig } from "../../env";
import { createLogger } from "../log";
import { createDb } from "./client";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const log = createLogger(logConfig(loadLogEnv()));

if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  log.info("No migrations to apply yet");
  process.exit(0);
}

const { DATABASE_URL } = loadDatabaseEnv();
const { db, sql } = createDb(DATABASE_URL);

try {
  await migrate(db, { migrationsFolder });
  log.info("Migrations applied");
} finally {
  await sql.end();
}

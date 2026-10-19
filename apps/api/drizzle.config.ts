import { defineConfig } from "drizzle-kit";
import { loadDatabaseEnv } from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: loadDatabaseEnv().DATABASE_URL },
  casing: "snake_case",
  strict: true,
});

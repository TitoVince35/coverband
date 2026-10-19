import { asc, eq } from "drizzle-orm";
import { createAuth } from "./adapters/auth";
import { createMemoryMailer } from "./adapters/mail/mailer";
import { createMemoryStorage } from "./adapters/storage";
import { createDb, type Db } from "./core/db/client";
import { activity } from "./core/db/schema";
import type { AppDeps } from "./deps";

/**
 * App dependencies for tests. Without a database URL, the database is never connected to
 * (postgres.js connects on the first query), which is enough for routes that don't use it.
 */
export function createTestDeps(databaseUrl = "postgres://unused@localhost:1/unused") {
  const { db, sql } = createDb(databaseUrl);
  const mailer = createMemoryMailer();
  const storage = createMemoryStorage();
  const auth = createAuth({
    db,
    mailer,
    secret: "test-secret-test-secret-test-secret",
    baseURL: "http://localhost:3000",
    rateLimit: false,
  });
  const deps: AppDeps = { auth, db, mailer, storage, appUrl: "http://localhost:3000" };
  return { deps, db, sql, auth, mailer, storage };
}

/** Activity recorded about a target, oldest first (events of one transaction by action). */
export function activityOf(db: Db, targetId: string) {
  return db
    .select({
      action: activity.action,
      bandId: activity.bandId,
      actorId: activity.actorId,
      targetType: activity.targetType,
      data: activity.data,
    })
    .from(activity)
    .where(eq(activity.targetId, targetId))
    .orderBy(asc(activity.createdAt), asc(activity.action));
}

import { asc, eq } from "drizzle-orm";
import type { AppDeps } from "./app";
import { createAuth } from "./auth";
import { createDb, type Db } from "./db/client";
import { activity } from "./db/schema";
import { createMemoryMailer } from "./mail/mailer";

/**
 * App dependencies for tests. Without a database URL, the database is never connected to
 * (postgres.js connects on the first query), which is enough for routes that don't use it.
 */
export function createTestDeps(databaseUrl = "postgres://unused@localhost:1/unused") {
  const { db, sql } = createDb(databaseUrl);
  const mailer = createMemoryMailer();
  const auth = createAuth({
    db,
    mailer,
    secret: "test-secret-test-secret-test-secret",
    baseURL: "http://localhost:3000",
    rateLimit: false,
  });
  const deps: AppDeps = { auth, db, mailer, appUrl: "http://localhost:3000" };
  return { deps, db, sql, auth, mailer };
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

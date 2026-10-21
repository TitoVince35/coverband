import { asc, eq } from "drizzle-orm";
import { createAuth } from "./adapters/auth";
import { createMemoryCatalog } from "./adapters/deezer";
import { createMemoryLyricsProvider } from "./adapters/lyrics";
import { createMemoryMailer } from "./adapters/mail/mailer";
import { createMemoryStorage } from "./adapters/storage";
import { createMemoryVideoSearch } from "./adapters/youtube";
import { createDb, type Db } from "./core/db/client";
import { activity } from "./core/db/schema";
import { silentLogger } from "./core/log";
import type { AppDeps } from "./deps";

/**
 * App dependencies for tests. Without a database URL, the database is never connected to
 * (postgres.js connects on the first query), which is enough for routes that don't use it.
 */
export function createTestDeps(databaseUrl = "postgres://unused@localhost:1/unused") {
  const { db, sql } = createDb(databaseUrl);
  const mailer = createMemoryMailer();
  const storage = createMemoryStorage();
  const lyrics = createMemoryLyricsProvider();
  const catalog = createMemoryCatalog();
  const videos = createMemoryVideoSearch();
  const auth = createAuth({
    db,
    log: silentLogger,
    mailer,
    secret: "test-secret-test-secret-test-secret",
    baseURL: "http://localhost:3000",
    rateLimit: false,
  });
  const deps: AppDeps = {
    auth,
    db,
    log: silentLogger,
    mailer,
    storage,
    lyrics,
    catalog,
    videos,
    appUrl: "http://localhost:3000",
    buildInfo: { version: "0.0.0-test", build: "test" },
  };
  return { deps, db, sql, auth, mailer, storage, lyrics, catalog, videos };
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

/** Smallest bytes recognised as each format (only the signature is checked). */
export const WEBP = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);

import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { createTestDeps } from "../../test-deps";
import { ACTIVITY_RETENTION_DAYS } from "../activity/purge";
import { activity } from "../db/schema";
import type { AccessConfig } from "./access";

const cronSecret = "c".repeat(40);
const access: AccessConfig = {
  code: "open-sesame",
  secret: "test-secret-test-secret-test-secret",
  clientIpHeader: "x-forwarded-for",
  https: false,
};
const purge = (app: ReturnType<typeof createApp>, authorization?: string) =>
  app.request("/api/internal/purge-activity", {
    method: "POST",
    // As the Scaleway trigger sends it: without a content type, the CSRF guard sees a form post.
    headers: { "content-type": "application/json", ...(authorization && { authorization }) },
    body: "{}",
  });

describe("internal routes", () => {
  const { deps } = createTestDeps();

  test("don't exist without CRON_SECRET", async () => {
    expect((await purge(createApp({ deps }), `Bearer ${cronSecret}`)).status).toBe(404);
  });

  test("need the secret, and skip the beta access code (they check their own)", async () => {
    const app = createApp({ deps: { ...deps, cronSecret, access } });
    for (const authorization of [undefined, cronSecret, "Bearer wrong", `Bearer ${cronSecret}x`]) {
      const res = await purge(app, authorization);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
    }
  });
});

// Integration test: needs the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("activity purge", () => {
  const { deps, db, sql } = createTestDeps(databaseUrl);
  const app = createApp({ deps: { ...deps, cronSecret } });
  const day = 24 * 60 * 60 * 1000;
  const ids = { old: crypto.randomUUID(), kept: crypto.randomUUID() };

  afterAll(async () => {
    await db.delete(activity).where(inArray(activity.targetId, Object.values(ids)));
    await sql.end();
  });

  test("deletes the activity older than a year, keeps the rest", async () => {
    const at = (days: number) => new Date(Date.now() - days * day);
    await db.insert(activity).values([
      {
        action: "user.registered",
        targetType: "user",
        targetId: ids.old,
        createdAt: at(ACTIVITY_RETENTION_DAYS + 1),
      },
      {
        action: "user.registered",
        targetType: "user",
        targetId: ids.kept,
        createdAt: at(ACTIVITY_RETENTION_DAYS - 1),
      },
    ]);
    const res = await purge(app, `Bearer ${cronSecret}`);
    expect(res.status).toBe(200);
    const { deleted } = (await res.json()) as { deleted: number };
    expect(deleted).toBeGreaterThanOrEqual(1);
    const left = async (id: string) =>
      (await db.select().from(activity).where(eq(activity.targetId, id))).length;
    expect(await left(ids.old)).toBe(0);
    expect(await left(ids.kept)).toBe(1);
  });
});

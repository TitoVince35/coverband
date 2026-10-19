import { afterAll, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { Hono } from "hono";
import type { SessionUser } from "../../adapters/auth";
import { createTestDeps } from "../../test-deps";
import { rateLimits } from "../db/schema";
import { hit, type RateLimitRule, rateLimitUser } from "./rate-limit";
import type { SessionEnv } from "./session";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("rate limit", () => {
  const { db, sql } = createTestDeps(databaseUrl);
  const run = crypto.randomUUID().slice(0, 8);
  const rule: RateLimitRule = { name: `test-${run}`, max: 3, windowMs: 60_000 };

  afterAll(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `coverband:test-${run}:%`));
    await sql.end();
  });

  test("allows max requests per window, then says how long to wait", async () => {
    const start = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(await hit(db, rule, "a", start + i * 1000)).toBe(0);
    }
    expect(await hit(db, rule, "a", start + 30_000)).toBe(30);
    // Another subject has its own bucket.
    expect(await hit(db, rule, "b", start + 30_000)).toBe(0);
    // A new window starts once the previous one is over.
    expect(await hit(db, rule, "a", start + 60_000)).toBe(0);
    expect(await hit(db, rule, "a", start + 61_000)).toBe(0);
  });

  test("answers 429 too_many_requests with Retry-After, per user", async () => {
    const app = new Hono<SessionEnv>()
      .use(async (c, next) => {
        c.set("user", { id: c.req.header("x-user") ?? "" } as SessionUser);
        await next();
      })
      .post("/send", rateLimitUser(db, { ...rule, name: `test-${run}-route` }), (c) =>
        c.json({ ok: true }),
      );
    const send = (user: string) =>
      app.request("/send", { method: "POST", headers: { "x-user": user } });

    for (let i = 0; i < 3; i++) {
      expect((await send("u1")).status).toBe(200);
    }
    const refused = await send("u1");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toEqual({
      error: { code: "too_many_requests", message: "Too many requests, try again later" },
    });
    expect((await send("u2")).status).toBe(200);
  });
});

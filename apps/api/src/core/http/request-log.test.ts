import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createApp } from "../../app";
import { createTestDeps } from "../../test-deps";
import { createMemoryLogger } from "../log";
import { type LogEnv, requestLog } from "./request-log";

const { deps } = createTestDeps();

/** A small app like ours: the request logger first, a JSON 500 for unhandled errors. */
function appWith(slowMs?: number) {
  const { log, entries } = createMemoryLogger();
  const invitations = new Hono<LogEnv>()
    .use(async (c, next) => {
      c.set("log", c.var.log.child({ userId: "u1" }));
      await next();
    })
    .get("/:token", () => {
      throw new Error("boom");
    });
  const app = new Hono<LogEnv>()
    .use(requestLog(log, slowMs))
    .route("/api/invitations", invitations)
    .get("/api/unavailable", (c) => c.json({}, 503))
    .get("/api/missing", (c) => c.json({}, 404))
    .get("/api/slow", async (c) => {
      await Bun.sleep(30);
      return c.json({});
    })
    .get("/api/inside", (c) => {
      c.var.log.info("Inside", { songId: "s1" });
      return c.json({});
    });
  app.onError((_err, c) => c.json({ error: "Internal server error" }, 500));
  return { app, entries };
}

describe("requestLog", () => {
  test("logs unhandled errors with their stack and the route pattern, never the raw path", async () => {
    const { app, entries } = appWith();
    const res = await app.request("/api/invitations/secret-token-123");
    expect(res.status).toBe(500);
    expect(entries).toMatchObject([
      {
        level: "error",
        msg: "Unhandled error",
        method: "GET",
        route: "/api/invitations/:token",
        status: 500,
        userId: "u1",
        err: { message: "boom" },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain("secret-token-123");
    expect(entries[0]?.requestId).toBe(res.headers.get("x-request-id") ?? "");
  });

  test("5xx responses and slow requests are warnings; 4xx are not logged", async () => {
    const { app, entries } = appWith(10);
    await app.request("/api/unavailable");
    await app.request("/api/missing");
    await app.request("/api/slow");
    expect(entries).toMatchObject([
      { level: "warn", msg: "Server error", route: "/api/unavailable", status: 503 },
      { level: "warn", msg: "Slow request", route: "/api/slow", status: 200 },
    ]);
    expect(entries[1]?.durationMs as number).toBeGreaterThanOrEqual(10);
  });

  test("handlers log through the request's logger, under its request ID", async () => {
    const { app, entries } = appWith();
    const res = await app.request("/api/inside");
    const requestId = res.headers.get("x-request-id");
    expect(entries).toMatchObject([
      { level: "info", msg: "Inside", songId: "s1", requestId },
      { level: "debug", msg: "Request", route: "/api/inside", status: 200, requestId },
    ]);
  });

  test("every request gets its own ID: a client can't choose it", async () => {
    const { app } = appWith();
    const a = await app.request("/api/inside", { headers: { "x-request-id": "mine" } });
    const b = await app.request("/api/inside");
    expect(a.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });

  test("the app logs each request at debug level, by the route that answered", async () => {
    const { log, entries } = createMemoryLogger();
    const app = createApp({ deps: { ...deps, log } });
    await app.request("/api/health");
    await app.request("/api/nope");
    expect(entries).toMatchObject([
      { level: "debug", msg: "Request", method: "GET", route: "/api/health", status: 200 },
    ]);
  });
});

import { afterAll, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { Hono } from "hono";
import { createApp } from "../../app";
import { createTestDeps } from "../../test-deps";
import { rateLimits } from "../db/schema";
import { ACCESS_CODES, ACCESS_COOKIE, type AccessConfig, accessGate, accessToken } from "./access";

const config: AccessConfig = {
  code: "open-sesame",
  secret: "test-secret-test-secret-test-secret",
  clientIpHeader: "x-forwarded-for",
  https: false,
};
const validCookie = `${ACCESS_COOKIE}=${accessToken(config)}`;

describe("access gate", () => {
  const { deps } = createTestDeps();
  const app = createApp({ deps: { ...deps, access: config }, log: false });

  test("without the code, the API answers 403 access_required", async () => {
    const res = await app.request("/api/bands");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "access_required" } });
    const login = await app.request("/api/auth/sign-in/email", { method: "POST" });
    expect(login.status).toBe(403);
  });

  test("health, the code check and the session check stay open", async () => {
    expect((await app.request("/api/health")).status).toBe(200);
    expect(await (await app.request("/api/access")).json()).toEqual({
      required: true,
      granted: false,
    });
    expect((await app.request("/api/auth/get-session")).status).toBe(200);
  });

  test("the cookie lets requests through, a forged one doesn't", async () => {
    const res = await app.request("/api/bands", { headers: { cookie: validCookie } });
    // Through the gate: the route itself then asks for a login.
    expect(res.status).toBe(401);
    expect(
      await (await app.request("/api/access", { headers: { cookie: validCookie } })).json(),
    ).toEqual({ required: true, granted: true });
    const forged = await app.request("/api/bands", {
      headers: { cookie: `${ACCESS_COOKIE}=${accessToken({ ...config, code: "guess" })}` },
    });
    expect(forged.status).toBe(403);
  });

  test("changing the code shuts out the devices that had the old one", async () => {
    const changed = createApp({
      deps: { ...deps, access: { ...config, code: "new" } },
      log: false,
    });
    const res = await changed.request("/api/bands", { headers: { cookie: validCookie } });
    expect(res.status).toBe(403);
  });

  test("without a code configured, there is no gate", async () => {
    const open = createApp({ deps, log: false });
    expect((await open.request("/api/bands")).status).toBe(401);
    expect(await (await open.request("/api/access")).json()).toEqual({
      required: false,
      granted: true,
    });
  });
});

describe("email links grant access", () => {
  // Stand-ins for the onboarding and Better Auth routes behind the links.
  const app = new Hono()
    .use("/api/*", accessGate(config))
    .get("/api/invitations/:token", (c) =>
      c.req.param("token") === "valid" ? c.json({ email: "a@b.c" }) : c.json({}, 404),
    )
    .get("/api/auth/reset-password/:token", (c) =>
      c.redirect(
        c.req.param("token") === "valid"
          ? "/reset-password?token=valid"
          : "/reset-password?error=INVALID_TOKEN",
      ),
    );

  const grants = (res: Response) =>
    (res.headers.get("set-cookie") ?? "").startsWith(`${ACCESS_COOKIE}=${accessToken(config)}`);

  test("a valid invitation link sets the cookie, an unknown one doesn't", async () => {
    const valid = await app.request("/api/invitations/valid");
    expect(valid.status).toBe(200);
    expect(grants(valid)).toBe(true);
    expect(valid.headers.get("set-cookie")).toContain("HttpOnly");
    expect(valid.headers.get("set-cookie")).toContain("SameSite=Lax");
    const unknown = await app.request("/api/invitations/unknown");
    expect(unknown.status).toBe(404);
    expect(grants(unknown)).toBe(false);
  });

  test("a valid reset link sets the cookie, an invalid one doesn't", async () => {
    expect(grants(await app.request("/api/auth/reset-password/valid"))).toBe(true);
    expect(grants(await app.request("/api/auth/reset-password/expired"))).toBe(false);
  });
});

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("POST /api/access", () => {
  const { deps, db, sql } = createTestDeps(databaseUrl);
  const app = createApp({ deps: { ...deps, access: config }, log: false });
  // A made-up client IP per run, so the wrong-code counter starts at zero.
  const ip = `test-${crypto.randomUUID().slice(0, 8)}`;
  const post = (code: string, from = ip) =>
    app.request("/api/access", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": from },
      body: JSON.stringify({ code }),
    });

  afterAll(async () => {
    await db
      .delete(rateLimits)
      .where(like(rateLimits.key, `coverband:${ACCESS_CODES.name}:test-%`));
    await sql.end();
  });

  test("the right code sets the cookie", async () => {
    const res = await post(" open-sesame ", `${ip}-right`);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toStartWith(`${ACCESS_COOKIE}=${accessToken(config)}`);
  });

  test("a wrong code is refused, and too many are limited per IP", async () => {
    const wrong = await post("guess");
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toMatchObject({ error: { code: "access_code_invalid" } });
    expect(wrong.headers.get("set-cookie")).toBeNull();
    for (let i = 1; i < ACCESS_CODES.max; i++) await post("guess");
    const limited = await post("open-sesame");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });
});

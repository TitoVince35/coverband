import { afterAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { users } from "./db/schema";
import { loadSession, requireAdmin, requireUser, type SessionEnv } from "./middleware/session";
import { createTestDeps } from "./test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("authentication", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  // Unique emails so tests never collide with development data; deleted afterwards.
  const run = crypto.randomUUID().slice(0, 8);
  const adminEmail = `admin-${run}@test.localhost`;
  const userEmail = `user-${run}@test.localhost`;
  const password = "correct horse battery";

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, [adminEmail, userEmail]));
    await sql.end();
  });

  // A small app behind the guards, the way real routes will use them.
  const guarded = new Hono<SessionEnv>()
    .use(loadSession(auth))
    .get("/user", requireUser, (c) => c.json({ email: c.var.user?.email }))
    .get("/admin", requireAdmin, (c) => c.json({ ok: true }));

  async function login(email: string, pass: string) {
    return app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password: pass }),
    });
  }

  function cookieOf(res: Response) {
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  test("creates the default admin once and never changes it afterwards", async () => {
    expect(await ensureAdmin(auth, { email: adminEmail, password })).toBe("created");
    expect(await ensureAdmin(auth, { email: adminEmail, password: "another password!" })).toBe(
      "exists",
    );
    expect((await login(adminEmail, password)).status).toBe(200);
    expect((await login(adminEmail, "another password!")).status).toBe(401);
  });

  test("public sign-up is refused", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: `signup-${run}@test.localhost`, password, name: "Nope" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const created = await db
      .select()
      .from(users)
      .where(inArray(users.email, [`signup-${run}@test.localhost`]));
    expect(created).toHaveLength(0);
  });

  test("guards: anonymous gets 401 with an error code", async () => {
    const res = await guarded.request("/user");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Not logged in" } });
  });

  test("guards: a logged-in user passes requireUser but not requireAdmin", async () => {
    await auth.api.createUser({ body: { email: userEmail, password, name: "Musician" } });
    const cookie = cookieOf(await login(userEmail, password));

    const user = await guarded.request("/user", { headers: { cookie } });
    expect(await user.json()).toEqual({ email: userEmail });
    const admin = await guarded.request("/admin", { headers: { cookie } });
    expect(admin.status).toBe(403);
    expect(await admin.json()).toEqual({ error: { code: "forbidden", message: "Admins only" } });
  });

  test("new passwords shorter than the policy are refused", async () => {
    const cookie = cookieOf(await login(userEmail, password));
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ currentPassword: password, newPassword: "too short" }),
    });
    expect(res.status).toBe(400);
    expect((await login(userEmail, password)).status).toBe(200);
  });

  test("guards: the admin passes requireAdmin, and logging out ends the session", async () => {
    const cookie = cookieOf(await login(adminEmail, password));
    expect((await guarded.request("/admin", { headers: { cookie } })).status).toBe(200);

    const out = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: "http://localhost:3000" },
    });
    expect(out.status).toBe(200);
    expect((await guarded.request("/admin", { headers: { cookie } })).status).toBe(401);
  });
});

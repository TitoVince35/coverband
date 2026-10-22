import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { activityOf, createTestDeps } from "../../test-deps";
import { activity, sessions, users } from "../db/schema";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("impersonation (#214)", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const adminEmail = `admin-${run}@test.localhost`;
  const otherAdminEmail = `admin2-${run}@test.localhost`;
  const userEmail = `user-${run}@test.localhost`;
  const password = "correct horse battery";
  let adminId = "";
  let otherAdminId = "";
  let userId = "";

  /** The cookies a response sets, merged into the ones sent. */
  function withCookies(cookie: string, res: Response) {
    const jar = new Map(
      cookie ? cookie.split("; ").map((c) => c.split("=", 2) as [string, string]) : [],
    );
    for (const set of res.headers.getSetCookie()) {
      const [pair = "", ...attributes] = set.split(";");
      const [name = "", value = ""] = pair.split("=", 2);
      if (attributes.some((a) => /max-age=0/i.test(a)) || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  function call(path: string, cookie: string, init: { method?: string; body?: unknown } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        cookie,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  async function login(email: string) {
    return withCookies(
      "",
      await call("/auth/sign-in/email", "", { method: "POST", body: { email, password } }),
    );
  }

  async function viewAs(cookie: string, id: string) {
    const res = await call("/auth/admin/impersonate-user", cookie, {
      method: "POST",
      body: { userId: id },
    });
    return { res, cookie: withCookies(cookie, res) };
  }

  async function me(cookie: string) {
    return (await (await call("/auth/get-session", cookie)).json()) as {
      user: { id: string };
      session: { impersonatedBy?: string | null };
    } | null;
  }

  beforeAll(async () => {
    adminId = (
      await auth.api.createUser({
        body: { email: adminEmail, password, name: "Ada Admin", role: "admin" },
      })
    ).user.id;
    otherAdminId = (
      await auth.api.createUser({
        body: { email: otherAdminEmail, password, name: "Bob Admin", role: "admin" },
      })
    ).user.id;
    userId = (
      await auth.api.createUser({ body: { email: userEmail, password, name: "Max Musician" } })
    ).user.id;
  });

  afterAll(async () => {
    await db.delete(activity).where(inArray(activity.actorId, [adminId, otherAdminId, userId]));
    await db.delete(users).where(inArray(users.email, [adminEmail, otherAdminEmail, userEmail]));
    await sql.end();
  });

  test("an admin views the app as a user, read-only, then stops", async () => {
    const adminCookie = await login(adminEmail);
    const { res, cookie } = await viewAs(adminCookie, userId);
    expect(res.status).toBe(200);
    expect(await me(cookie)).toMatchObject({
      user: { id: userId },
      session: { impersonatedBy: adminId },
    });

    // Reads work as the user.
    expect((await call("/bands", cookie)).status).toBe(200);
    // Writes are refused: ours and Better Auth's.
    const write = await call("/me", cookie, {
      method: "PATCH",
      body: { firstName: "Hacked", lastName: "Name" },
    });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { error: { code: string } }).error.code).toBe(
      "impersonation_read_only",
    );
    const revoke = await call("/auth/revoke-other-sessions", cookie, { method: "POST", body: {} });
    expect(revoke.status).toBe(403);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user?.firstName).toBeNull();

    // Recorded: who viewed whom.
    expect(await activityOf(db, userId)).toContainEqual({
      action: "user.impersonated",
      bandId: null,
      actorId: adminId,
      targetType: "user",
      data: null,
    });

    // Stopping brings the admin's session back and deletes the user's.
    const stop = await call("/auth/admin/stop-impersonating", cookie, { method: "POST", body: {} });
    expect(stop.status).toBe(200);
    const back = withCookies(cookie, stop);
    expect(await me(back)).toMatchObject({ user: { id: adminId } });
    expect(
      await db.select().from(sessions).where(eq(sessions.impersonatedBy, adminId)),
    ).toHaveLength(0);
  });

  test("never another admin, and never by a user", async () => {
    expect((await viewAs(await login(adminEmail), otherAdminId)).res.status).toBe(403);
    expect((await viewAs(await login(userEmail), otherAdminId)).res.status).toBe(403);
  });

  test("other sessions write as usual", async () => {
    const cookie = await login(userEmail);
    const res = await call("/me", cookie, {
      method: "PATCH",
      body: { firstName: "Max", lastName: "Musician" },
    });
    expect(res.status).toBe(200);
  });
});

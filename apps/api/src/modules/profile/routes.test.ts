import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, users } from "../../core/db/schema";
import { activityOf, createTestDeps } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("my account: profile", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  const run = crypto.randomUUID().slice(0, 8);
  const email = `me-${run}@test.localhost`;
  const password = "correct horse battery";
  let cookie = "";
  let userId = "";

  function patch(body: unknown, withCookie = cookie) {
    return app.request("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: withCookie },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    const { user } = await auth.api.createUser({ body: { email, password, name: "Old Name" } });
    userId = user.id;
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    });
    cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });

  afterAll(async () => {
    await db.delete(activity).where(eq(activity.actorId, userId));
    await db.delete(users).where(eq(users.email, email));
    await sql.end();
  });

  test("logged-in users only; names are required and limited", async () => {
    expect((await patch({ firstName: "A", lastName: "B" }, "")).status).toBe(401);
    expect((await patch({ firstName: " ", lastName: "B" })).status).toBe(400);
    expect((await patch({ firstName: "A", lastName: "B".repeat(51) })).status).toBe(400);
    expect(await activityOf(db, userId)).toHaveLength(0);
  });

  test("updates the profile and recomputes the display name", async () => {
    const res = await patch({ firstName: " Jean ", lastName: "Dupont", nickname: " JD " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { name: "JD", firstName: "Jean", lastName: "Dupont", nickname: "JD" },
    });

    // An empty nickname clears it: the display name falls back to first and last name.
    const cleared = await patch({ firstName: "Jean", lastName: "Dupont", nickname: "" });
    expect(((await cleared.json()) as { user: unknown }).user).toEqual({
      name: "Jean Dupont",
      firstName: "Jean",
      lastName: "Dupont",
      nickname: null,
    });

    // The session shows the new name.
    const session = await app.request("/api/auth/get-session", { headers: { cookie } });
    expect(((await session.json()) as { user: { name: string } }).user.name).toBe("Jean Dupont");

    // IDs only: no names in the activity.
    expect(await activityOf(db, userId)).toEqual([
      {
        action: "user.profile_updated",
        bandId: null,
        actorId: userId,
        targetType: "user",
        data: null,
      },
      {
        action: "user.profile_updated",
        bandId: null,
        actorId: userId,
        targetType: "user",
        data: null,
      },
    ]);
  });
});

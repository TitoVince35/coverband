import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, notifications, users } from "../../core/db/schema";
import { activityOf, createTestDeps } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("notifications (#260)", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const adminEmail = `admin-${run}@test.localhost`;
  const userEmail = `user-${run}@test.localhost`;
  const laterEmail = `later-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const userIds: string[] = [];
  const noteIds: string[] = [];

  async function createAndLogin(email: string, role?: "admin") {
    const created = await auth.api.createUser({
      body: { email, password, name: "Test", ...(role && { role }) },
    });
    userIds.push(created.user.id);
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    });
    cookies[email] = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return created.user.id;
  }

  function call(path: string, email: string, init: { method?: string; body?: unknown } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", cookie: cookies[email] ?? "" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  async function send(text: string) {
    const res = await call("/admin/notifications", adminEmail, { method: "POST", body: { text } });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string } };
    noteIds.push(data.id);
    return data.id;
  }

  const unread = async (email: string) =>
    ((await (await call("/notifications", email)).json()) as { notifications: { id: string }[] })
      .notifications;

  beforeAll(async () => {
    await createAndLogin(adminEmail, "admin");
    await createAndLogin(userEmail);
    // Account and note creation times must differ.
    await Bun.sleep(5);
  });

  afterAll(async () => {
    await db.delete(notifications).where(inArray(notifications.id, noteIds));
    await db.delete(activity).where(inArray(activity.actorId, userIds));
    await db.delete(users).where(inArray(users.email, [adminEmail, userEmail, laterEmail]));
    await sql.end();
  });

  test("only admins send and list notes", async () => {
    for (const [method, body] of [
      ["GET", undefined],
      ["POST", { text: "Hi" }],
    ] as const) {
      const anonymous = await app.request("/api/admin/notifications", {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      });
      expect(anonymous.status).toBe(401);
      expect((await call("/admin/notifications", userEmail, { method, body })).status).toBe(403);
    }
    expect((await call("/notifications", "nobody")).status).toBe(401);
  });

  test("a note is plain text, trimmed, never empty", async () => {
    const blank = await call("/admin/notifications", adminEmail, {
      method: "POST",
      body: { text: "  \n " },
    });
    expect(blank.status).toBe(400);
    const id = await send("  Version 0.9 is out!\n\nSetlists are here.  ");
    const [row] = await db
      .select()
      .from(notifications)
      .where(inArray(notifications.id, [id]));
    expect(row).toMatchObject({
      kind: "admin-modal",
      sender: "team",
      text: "Version 0.9 is out!\n\nSetlists are here.",
    });
    expect(await activityOf(db, id)).toEqual([
      expect.objectContaining({ action: "notification.sent", actorId: userIds[0], bandId: null }),
    ]);
  });

  test("users see the notes sent since their account exists, oldest first, until they read them", async () => {
    const second = await send("Second note");
    await Bun.sleep(5);
    const laterId = await createAndLogin(laterEmail);
    await Bun.sleep(5);
    const third = await send("Third note");

    const mine = (await unread(userEmail)).filter((note) => noteIds.includes(note.id));
    expect(mine.map((note) => note.id)).toEqual(noteIds);
    expect(mine[0]).toMatchObject({ kind: "admin-modal", sender: "team" });
    // Sent before the account existed: never shown.
    expect((await unread(laterEmail)).map((note) => note.id)).toEqual([third]);

    const read = (id: string, email = userEmail) =>
      call(`/notifications/${id}/read`, email, { method: "POST" });
    expect((await read(second)).status).toBe(204);
    // Again: still fine, recorded once.
    expect((await read(second)).status).toBe(204);
    expect((await activityOf(db, second)).map((event) => event.action)).toEqual([
      "notification.sent",
      "notification.read",
    ]);
    expect((await unread(userEmail)).map((note) => note.id)).not.toContain(second);
    // Not theirs, or unknown: not found.
    expect((await read(second, laterEmail)).status).toBe(404);
    expect((await read(crypto.randomUUID(), laterEmail)).status).toBe(404);
    expect(laterId).toBeString();
  });

  test("the admin's list: newest first, how many recipients read each", async () => {
    const res = await call("/admin/notifications?perPage=100", adminEmail);
    expect(res.status).toBe(200);
    const { data, total } = (await res.json()) as {
      data: { id: string; text: string; sentBy: string; recipients: number; readers: number }[];
      total: number;
    };
    expect(total).toBeGreaterThanOrEqual(3);
    const ours = data.filter((note) => noteIds.includes(note.id));
    expect(ours.map((note) => note.text)).toEqual([
      "Third note",
      "Second note",
      "Version 0.9 is out!\n\nSetlists are here.",
    ]);
    expect(ours[0]?.sentBy).toBe("Test");
    // The later user only received the third note; the user read the second.
    expect((ours[0]?.recipients ?? 0) - (ours[1]?.recipients ?? 0)).toBe(1);
    expect(ours.map((note) => note.readers)).toEqual([0, 1, 0]);
  });
});

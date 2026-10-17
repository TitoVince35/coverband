import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../app";
import { imageType } from "../avatars";
import { activity, bandMembers, bands, users } from "../db/schema";
import { activityOf, createTestDeps } from "../test-deps";

/** Smallest bytes the API recognises as each format (it only checks the signature). */
const WEBP = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);

test("imageType recognises WebP and JPEG by their first bytes only", () => {
  expect(imageType(WEBP)?.type).toBe("image/webp");
  expect(imageType(JPEG)?.type).toBe("image/jpeg");
  expect(imageType(PNG)).toBeNull();
  expect(imageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  expect(imageType(new Uint8Array())).toBeNull();
});

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("avatars", () => {
  const { deps, db, sql, auth, storage } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  function call(path: string, who: string, init: { method?: string; body?: Uint8Array } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: { cookie: cookies[who] ?? "", "content-type": "application/octet-stream" },
      body: init.body,
    });
  }

  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  const imageOf = async (who: string) =>
    (
      await db
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, ids[who] ?? ""))
    )[0]?.image ?? null;

  beforeAll(async () => {
    const [band] = await db
      .insert(bands)
      .values({ name: `Avatars ${run}`, slug: `avatars-${run}` })
      .returning();
    for (const who of ["me", "mate", "outsider", "admin"]) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: who, role: who === "admin" ? "admin" : "user" },
      });
      ids[who] = user.id;
      if (who === "me" || who === "mate") {
        await db.insert(bandMembers).values({
          bandId: band?.id ?? "",
          userId: user.id,
          role: who === "me" ? "leader" : "musician",
          instrument: "Bass",
        });
      }
      const res = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: email(who), password }),
      });
      cookies[who] = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    }
  });

  afterAll(async () => {
    await db.delete(activity).where(eq(activity.actorId, ids.me ?? ""));
    await db.delete(bands).where(like(bands.slug, `avatars-${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("logged-in users only; only WebP and JPEG are accepted", async () => {
    expect((await call("/me/avatar", "nobody", { method: "PUT", body: WEBP })).status).toBe(401);
    const png = await call("/me/avatar", "me", { method: "PUT", body: PNG });
    expect(png.status).toBe(400);
    expect(await errorCode(png)).toBe("invalid_image");
    expect(await imageOf("me")).toBeNull();
    expect(storage.objects.size).toBe(0);
  });

  test("an upload is stored under a new key; replacing it deletes the old file", async () => {
    const res = await call("/me/avatar", "me", { method: "PUT", body: WEBP });
    expect(res.status).toBe(200);
    const first = await imageOf("me");
    expect(first).toMatch(new RegExp(`^users/${ids.me}/avatar/[0-9a-f-]{36}\\.webp$`));
    const { avatarUrl } = (await res.json()) as { avatarUrl: string };
    expect(avatarUrl).toBe(
      `/api/users/${ids.me}/avatar?v=${first?.split("/").pop()?.split(".")[0]}`,
    );

    await call("/me/avatar", "me", { method: "PUT", body: JPEG });
    const second = await imageOf("me");
    expect(second).toEndWith(".jpg");
    expect([...storage.objects.keys()]).toEqual([second ?? ""]);
  });

  test("seen by the user, band mates and admins; a 404 for anyone else", async () => {
    const path = `/users/${ids.me}/avatar`;
    for (const who of ["me", "mate", "admin"]) {
      const res = await call(path, who);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    }
    expect((await call(path, "outsider")).status).toBe(404);
    expect((await call(path, "nobody")).status).toBe(401);
    // Someone without an avatar, or an unknown user: 404 too.
    expect((await call(`/users/${ids.mate}/avatar`, "me")).status).toBe(404);
    expect((await call(`/users/${crypto.randomUUID()}/avatar`, "admin")).status).toBe(404);
  });

  test("only the current versioned URL is cached for good", async () => {
    const version = (await imageOf("me"))?.split("/").pop()?.split(".")[0];
    const current = await call(`/users/${ids.me}/avatar?v=${version}`, "mate");
    expect(current.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    const stale = await call(`/users/${ids.me}/avatar?v=old`, "mate");
    expect(stale.headers.get("cache-control")).toBe("private, no-cache");
  });

  test("removing brings back the default and deletes the file", async () => {
    expect((await call("/me/avatar", "me", { method: "DELETE" })).status).toBe(204);
    expect(await imageOf("me")).toBeNull();
    expect(storage.objects.size).toBe(0);
    expect((await call(`/users/${ids.me}/avatar`, "me")).status).toBe(404);
    // Nothing left to remove: still fine, nothing recorded.
    expect((await call("/me/avatar", "me", { method: "DELETE" })).status).toBe(204);

    expect(await activityOf(db, ids.me ?? "")).toMatchObject([
      { action: "user.avatar_changed", bandId: null, actorId: ids.me, data: { removed: false } },
      { action: "user.avatar_changed", data: { removed: false } },
      { action: "user.avatar_changed", data: { removed: true } },
    ]);
  });
});

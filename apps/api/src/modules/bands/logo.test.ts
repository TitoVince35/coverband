import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type BandLogo, LOGO_MAX_BYTES } from "@coverband/shared";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, users } from "../../core/db/schema";
import { activityOf, createTestDeps, JPEG, PNG, WEBP } from "../../test-deps";
import { ownLogoKey } from "./logo";

test("ownLogoKey only accepts keys the server writes for that band's logo", () => {
  const uuid = crypto.randomUUID();
  expect(ownLogoKey("b1", `bands/b1/logo/${uuid}.png`)).toBe(`bands/b1/logo/${uuid}.png`);
  expect(ownLogoKey("b1", `bands/b1/logo/${uuid}-thumbnail.webp`)).not.toBeNull();
  expect(ownLogoKey("b1", `bands/b2/logo/${uuid}.png`)).toBeNull();
  expect(ownLogoKey("b1", `users/u1/avatar/${uuid}.webp`)).toBeNull();
  expect(ownLogoKey("b1", `bands/b1/logo/${uuid}.svg`)).toBeNull();
  expect(ownLogoKey("b1", null)).toBeNull();
});

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("band logo", () => {
  const { deps, db, sql, auth, storage } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const bandSlug = `logo-band-${run}`;
  let bandId = "";

  async function login(address: string) {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: address, password }),
    });
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  async function member(who: string, slug: string, role: "leader" | "musician") {
    const { user } = await auth.api.createUser({
      body: { email: email(who), password, name: who },
    });
    let [band] = await db.select().from(bands).where(eq(bands.slug, slug));
    if (!band) {
      [band] = await db
        .insert(bands)
        .values({ name: `${slug} name`, slug })
        .returning();
    }
    await db.insert(bandMembers).values({ bandId: band?.id ?? "", userId: user.id, role });
    cookies[who] = await login(email(who));
    return band?.id ?? "";
  }

  function call(path: string, who: string, init: { method?: string; json?: unknown } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.json === undefined ? {} : { "content-type": "application/json" }),
        cookie: cookies[who] ?? "",
        origin: "http://localhost:3000",
      },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  }

  /** Uploads a logo as the browser does: a multipart form with both files. */
  function upload(
    who: string,
    files: { logo: Uint8Array; thumbnail: Uint8Array },
    extra: Record<string, string> = {},
  ) {
    const form = new FormData();
    form.append("logo", new File([files.logo], "logo"));
    form.append("thumbnail", new File([files.thumbnail], "thumbnail"));
    for (const [name, value] of Object.entries(extra)) form.append(name, value);
    return app.request(`/api/bands/${bandSlug}/logo`, {
      method: "PUT",
      headers: { cookie: cookies[who] ?? "", origin: "http://localhost:3000" },
      body: form,
    });
  }

  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  async function currentKeys() {
    const [band] = await db
      .select({ logo: bands.logoKey, thumbnail: bands.logoThumbnailKey })
      .from(bands)
      .where(eq(bands.id, bandId));
    return { logo: band?.logo ?? null, thumbnail: band?.thumbnail ?? null };
  }

  beforeAll(async () => {
    bandId = await member("leader", bandSlug, "leader");
    await member("bassist", bandSlug, "musician");
    await member("outsider", `logo-other-${run}`, "leader");
  });

  afterAll(async () => {
    const testUsers = db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%-${run}@test.localhost`));
    await db.delete(activity).where(inArray(activity.actorId, testUsers));
    await db.delete(bands).where(like(bands.slug, `%${run}%`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("no logo at first, and nothing to serve", async () => {
    const res = await call(`/bands/${bandSlug}`, "bassist");
    expect(((await res.json()) as { band: { logo: unknown } }).band.logo).toBeNull();
    expect((await call(`/bands/${bandSlug}/logo`, "bassist")).status).toBe(404);
  });

  test("the band leader only uploads it; PNG, WebP or JPEG", async () => {
    const files = { logo: PNG, thumbnail: WEBP };
    expect((await upload("bassist", files)).status).toBe(403);
    expect((await upload("outsider", files)).status).toBe(404);
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    const invalid = await upload("leader", { logo: svg, thumbnail: WEBP });
    expect(invalid.status).toBe(400);
    expect(await errorCode(invalid)).toBe("invalid_image");
    expect(await currentKeys()).toEqual({ logo: null, thumbnail: null });
  });

  test("a logo over the limit is refused, larger than the API's usual body limit is fine", async () => {
    const tooLarge = new Uint8Array(LOGO_MAX_BYTES + 1);
    tooLarge.set(PNG);
    const res = await upload("leader", { logo: tooLarge, thumbnail: WEBP });
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("image_too_large");

    const large = new Uint8Array(500_000);
    large.set(PNG);
    expect((await upload("leader", { logo: large, thumbnail: WEBP })).status).toBe(200);
    // Elsewhere, the usual limit stays.
    const other = await call(`/bands/${bandSlug}`, "leader", {
      method: "PATCH",
      json: { genre: "x".repeat(200_000) },
    });
    expect(other.status).toBe(413);
  });

  test("members see it, with URLs that change with the files", async () => {
    // An app still on 0.4 sends a background: ignored, there is none any more (#189).
    const res = await upload("leader", { logo: PNG, thumbnail: WEBP }, { background: "dark" });
    expect(res.status).toBe(200);
    const { logo } = (await res.json()) as { logo: BandLogo };
    expect(logo).not.toHaveProperty("background");
    expect(logo.url).toMatch(new RegExp(`^/api/bands/${bandSlug}/logo\\?v=[0-9a-f-]{36}$`));

    const band = await call(`/bands/${bandSlug}`, "bassist");
    expect(((await band.json()) as { band: { logo: BandLogo } }).band.logo).toEqual(logo);
    const list = await call("/bands", "bassist");
    const { bands: mine } = (await list.json()) as { bands: { logo: BandLogo }[] };
    expect(mine[0]?.logo).toEqual(logo);

    const file = await app.request(logo.url, { headers: { cookie: cookies.bassist ?? "" } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
    const thumbnail = await app.request(logo.thumbnailUrl, {
      headers: { cookie: cookies.bassist ?? "" },
    });
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");

    const stale = await app.request(`/api/bands/${bandSlug}/logo?v=old`, {
      headers: { cookie: cookies.bassist ?? "" },
    });
    expect(stale.headers.get("cache-control")).toBe("private, no-cache");
    const outsider = await app.request(logo.url, { headers: { cookie: cookies.outsider ?? "" } });
    expect(outsider.status).toBe(404);
  });

  test("replacing it deletes the previous files", async () => {
    const before = await currentKeys();
    expect((await upload("leader", { logo: JPEG, thumbnail: JPEG })).status).toBe(200);
    const after = await currentKeys();
    expect(after.logo).toMatch(/\.jpg$/);
    expect(await storage.get(before.logo ?? "")).toBeNull();
    expect(await storage.get(before.thumbnail ?? "")).toBeNull();
    expect(await storage.get(after.logo ?? "")).not.toBeNull();
  });

  test("removing it deletes its files; there is no background to change", async () => {
    const keys = await currentKeys();
    expect((await call(`/bands/${bandSlug}/logo`, "bassist", { method: "DELETE" })).status).toBe(
      403,
    );
    expect((await call(`/bands/${bandSlug}/logo`, "leader", { method: "DELETE" })).status).toBe(
      204,
    );
    expect(await currentKeys()).toEqual({ logo: null, thumbnail: null });
    expect(await storage.get(keys.logo ?? "")).toBeNull();
    expect(await storage.get(keys.thumbnail ?? "")).toBeNull();
    // Again: nothing to do, no event.
    expect((await call(`/bands/${bandSlug}/logo`, "leader", { method: "DELETE" })).status).toBe(
      204,
    );
    const background = await call(`/bands/${bandSlug}/logo`, "leader", {
      method: "PATCH",
      json: { background: "dark" },
    });
    // The background route is gone.
    expect(background.status).toBe(404);
  });

  test("every change is a logo_changed event, in the journal", async () => {
    const events = (await activityOf(db, bandId)).filter((e) => e.action === "band.logo_changed");
    expect(events.map((e) => (e.data as { change: string }).change)).toEqual([
      "added",
      "replaced",
      "replaced",
      "removed",
    ]);
    const res = await call(`/bands/${bandSlug}/activity`, "bassist");
    const { entries: journal } = (await res.json()) as {
      entries: { action: string; logo?: string }[];
    };
    expect(journal.filter((e) => e.action === "band.logo_changed").map((e) => e.logo)).toEqual([
      "removed",
      "changed",
      "changed",
      "changed",
    ]);
  });
});

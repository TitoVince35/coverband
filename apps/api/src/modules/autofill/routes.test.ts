import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, rateLimits, users } from "../../core/db/schema";
import { createTestDeps } from "../../test-deps";
import { AUTOFILL_SEARCHES } from "./routes";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("autofill", () => {
  const { deps, db, sql, auth, catalog, videos } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const slug = `autofill-${run}`;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const search = (who: string, query: Record<string, string>, band = slug) =>
    app.request(`/api/bands/${band}/autofill?${new URLSearchParams(query)}`, {
      headers: { cookie: cookies[who] ?? "" },
    });
  const zombie = { title: "Zombie", artist: "The Cranberries" };
  const zombieTrack = {
    url: "https://www.deezer.com/track/2",
    title: "Zombie",
    artist: "The Cranberries",
    album: "No Need to Argue",
    duration: 306,
    genre: "Rock",
  };

  beforeAll(async () => {
    const [band, other] = await db
      .insert(bands)
      .values([
        { name: `Autofill ${run}`, slug },
        { name: `Autofill other ${run}`, slug: `autofill-other-${run}` },
      ])
      .returning();
    const members = [
      ["lea", band?.id, "leader"],
      ["max", band?.id, "musician"],
      ["zoe", other?.id, "leader"],
    ] as const;
    for (const [who, memberOf, role] of members) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: `${who} name` },
      });
      ids[who] = user.id;
      await db.insert(bandMembers).values({ bandId: memberOf ?? "", userId: user.id, role });
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
    await db
      .delete(rateLimits)
      .where(like(rateLimits.key, `coverband:${AUTOFILL_SEARCHES.name}:%`));
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(bands).where(like(bands.slug, `autofill-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("members only; a title and an artist are needed", async () => {
    expect((await search("zoe", zombie)).status).toBe(404);
    expect((await search("nobody", zombie)).status).toBe(401);
    expect((await search("max", { title: "Zombie" })).status).toBe(400);
    expect((await search("max", { title: " ", artist: "x" })).status).toBe(400);
  });

  test("Deezer's track for the song, or none", async () => {
    catalog.track = {
      url: "https://www.deezer.com/track/2",
      title: "Zombie",
      artist: "The Cranberries",
      album: "No Need to Argue",
      duration: 306,
      genre: "Rock",
    };
    const res = await search("max", { title: " Zombie ", artist: "The Cranberries" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ track: catalog.track, videos: [] });
    expect(catalog.searches.at(-1)).toEqual(zombie);

    catalog.track = null;
    expect(await (await search("lea", zombie)).json()).toEqual({ track: null, videos: [] });
  });

  test("YouTube's best videos, their thumbnails through the API; none when it fails", async () => {
    const video = (id: string, title: string, channel: string) => ({
      id,
      title,
      channel,
      duration: 306,
      description: "",
    });
    videos.videos = [
      video("Live0000001", "Zombie (Live)", "The Cranberries"),
      video("Topic000001", "Zombie", "The Cranberries - Topic"),
    ];
    const res = await search("max", zombie);
    const { videos: proposed } = (await res.json()) as { videos: { id: string }[] };
    expect(proposed).toEqual([
      {
        id: "Topic000001",
        url: "https://www.youtube.com/watch?v=Topic000001",
        title: "Zombie",
        channel: "The Cranberries - Topic",
        duration: 306,
        thumbnailUrl: `/api/bands/${slug}/autofill/thumbnails/Topic000001`,
      },
      expect.objectContaining({ id: "Live0000001" }),
    ]);

    const thumbnail = await app.request(`/api/bands/${slug}/autofill/thumbnails/Topic000001`, {
      headers: { cookie: cookies.max ?? "" },
    });
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/jpeg");
    expect(await thumbnail.text()).toBe("thumbnail Topic000001");
    const thumbnailOf = (who: string, id: string, band = slug) =>
      app.request(`/api/bands/${band}/autofill/thumbnails/${id}`, {
        headers: { cookie: cookies[who] ?? "" },
      });
    expect((await thumbnailOf("max", "not-an-id")).status).toBe(404);
    expect((await thumbnailOf("zoe", "Topic000001")).status).toBe(404);

    // YouTube down (a quota exceeded, a bad key): Deezer's details still come.
    videos.down = true;
    catalog.track = { ...zombieTrack };
    expect(await (await search("max", zombie)).json()).toEqual({
      track: zombieTrack,
      videos: null,
    });
    videos.down = false;
    videos.videos = [];
  });

  test(`${AUTOFILL_SEARCHES.max} searches a day per band, whoever searches`, async () => {
    // The band has searched 4 times already (above; the refused ones don't count).
    for (let i = 4; i < AUTOFILL_SEARCHES.max; i++) {
      expect((await search(i % 2 ? "lea" : "max", zombie)).status).toBe(200);
    }
    const over = await search("lea", zombie);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another band has its own quota.
    expect((await search("zoe", zombie, `autofill-other-${run}`)).status).toBe(200);
  });
});

describe.skipIf(!databaseUrl)("autofill without a YouTube key", () => {
  test("no videos, Deezer's details still", async () => {
    const { deps, db, sql, auth } = createTestDeps(databaseUrl);
    const { videos: _, ...withoutYoutube } = deps;
    const app = createApp({ deps: withoutYoutube });
    const run = crypto.randomUUID().slice(0, 8);
    const [band] = await db
      .insert(bands)
      .values({ name: `Autofill nokey ${run}`, slug: `autofill-nokey-${run}` })
      .returning();
    const address = `nokey-${run}@test.localhost`;
    const { user } = await auth.api.createUser({
      body: { email: address, password: "correct horse battery", name: "nokey" },
    });
    await db
      .insert(bandMembers)
      .values({ bandId: band?.id ?? "", userId: user.id, role: "leader" });
    const login = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: address, password: "correct horse battery" }),
    });
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const res = await app.request(
      `/api/bands/autofill-nokey-${run}/autofill?title=Zombie&artist=The%20Cranberries`,
      { headers: { cookie } },
    );
    expect(await res.json()).toEqual({ track: null, videos: null });
    const thumbnail = await app.request(
      `/api/bands/autofill-nokey-${run}/autofill/thumbnails/Topic000001`,
      { headers: { cookie } },
    );
    expect(thumbnail.status).toBe(404);
    await db.delete(activity).where(inArray(activity.actorId, [user.id]));
    await db.delete(bands).where(like(bands.slug, `autofill-nokey-${run}`));
    await db.delete(users).where(like(users.email, address));
    await sql.end();
  });
});

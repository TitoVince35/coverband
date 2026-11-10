import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SETLIST_LIMITS } from "@coverband/shared";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, songs, users } from "../../core/db/schema";
import { activityOf, createTestDeps } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Content = {
  id: string;
  version: number;
  parts: { name: string | null; songs: { id: string; title: string }[] }[];
};

describe.skipIf(!databaseUrl)("a setlist's parts and songs (#272)", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `setlist-content-${run}`;
  const otherSlug = `setlist-content-other-${run}`;
  const song: Record<string, string> = {};
  let otherSong = "";
  let bandId = "";

  function call(path: string, who: string, init: { method?: string; body?: unknown } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        cookie: cookies[who] ?? "",
        origin: "http://localhost:3000",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  const create = async (title: string) =>
    (
      (await (
        await call(`/bands/${slug}/setlists`, "lea", { method: "POST", body: { title } })
      ).json()) as { setlist: Content }
    ).setlist;
  const read = async (id: string) =>
    ((await (await call(`/bands/${slug}/setlists/${id}`, "max")).json()) as { setlist: Content })
      .setlist;
  const save = (who: string, id: string, body: unknown) =>
    call(`/bands/${slug}/setlists/${id}/content`, who, { method: "PUT", body });
  const errorOf = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;

  beforeAll(async () => {
    const [band, other] = await db
      .insert(bands)
      .values([
        { name: `Setlist content ${run}`, slug },
        { name: `Setlist content other ${run}`, slug: otherSlug },
      ])
      .returning();
    bandId = band?.id ?? "";
    for (const [who, role] of [
      ["lea", "leader"],
      ["max", "musician"],
    ] as const) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: `${who} name` },
      });
      ids[who] = user.id;
      await db.insert(bandMembers).values({ bandId, userId: user.id, role });
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
    const rows = await db
      .insert(songs)
      .values([
        { bandId, title: "Africa", artist: "Toto", standardDuration: 295 },
        { bandId, title: "Zombie", artist: "The Cranberries", ownDuration: 306 },
        { bandId, title: "Linger", artist: "The Cranberries" },
      ])
      .returning({ id: songs.id, title: songs.title });
    for (const row of rows) song[row.title] = row.id;
    const [foreign] = await db
      .insert(songs)
      .values({ bandId: other?.id ?? "", title: "Elsewhere", artist: "Other" })
      .returning({ id: songs.id });
    otherSong = foreign?.id ?? "";
  });

  afterAll(async () => {
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(bands).where(like(bands.slug, `setlist-content-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("a new setlist has one unnamed, empty part", async () => {
    const setlist = await create("New one");
    expect(setlist.parts).toEqual([{ name: null, songs: [] }]);
    expect(setlist.version).toBe(1);
  });

  test("saving replaces the parts and songs, in order, and raises the version", async () => {
    const setlist = await create("Wedding");
    const res = await save("max", setlist.id, {
      version: 1,
      parts: [
        { name: " Set 1 ", songs: [song.Africa, song.Zombie] },
        { name: "", songs: [song.Linger, song.Africa] },
      ],
    });
    expect(res.status).toBe(200);
    const saved = await read(setlist.id);
    expect(saved.version).toBe(2);
    expect(
      saved.parts.map((part) => ({ name: part.name, songs: part.songs.map((s) => s.title) })),
    ).toEqual([
      { name: "Set 1", songs: ["Africa", "Zombie"] },
      // The same song twice is fine; a blank name is none.
      { name: null, songs: ["Linger", "Africa"] },
    ]);
  });

  test("the list gives each setlist's parts, songs and duration, songs without one apart", async () => {
    const { setlists } = (await (await call(`/bands/${slug}/setlists`, "lea")).json()) as {
      setlists: {
        title: string;
        parts: number;
        songs: number;
        duration: { seconds: number; missing: number };
      }[];
    };
    expect(setlists.find((s) => s.title === "Wedding")).toMatchObject({
      parts: 2,
      songs: 4,
      // Africa twice (295), Zombie's own duration (306), Linger without one.
      duration: { seconds: 295 * 2 + 306, missing: 1 },
    });
  });

  test("a save on an older version is refused: nobody silently undoes another's change", async () => {
    const setlist = await create("Two editors");
    expect(
      (await save("lea", setlist.id, { version: 1, parts: [{ name: null, songs: [song.Africa] }] }))
        .status,
    ).toBe(200);
    const stale = await save("max", setlist.id, {
      version: 1,
      parts: [{ name: null, songs: [song.Zombie] }],
    });
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toBe("setlist_outdated");
    expect((await read(setlist.id)).parts[0]?.songs.map((s) => s.title)).toEqual(["Africa"]);
  });

  test("one setlist.updated per member within a while, however many saves", async () => {
    const setlist = await create("Many saves");
    for (const version of [1, 2, 3]) {
      await save("max", setlist.id, { version, parts: [{ name: null, songs: [song.Africa] }] });
    }
    expect((await activityOf(db, setlist.id)).map((event) => event.action)).toEqual([
      "setlist.created",
      "setlist.updated",
    ]);
  });

  test("limits: parts, songs, another band's song, an archived setlist", async () => {
    const setlist = await create("Limits");
    const tooManyParts = Array.from({ length: SETLIST_LIMITS.parts + 1 }, () => ({
      name: null,
      songs: [],
    }));
    expect((await save("lea", setlist.id, { version: 1, parts: tooManyParts })).status).toBe(400);
    expect((await save("lea", setlist.id, { version: 1, parts: [] })).status).toBe(400);
    const tooManySongs = Array.from({ length: SETLIST_LIMITS.songs + 1 }, () => song.Africa);
    expect(
      (await save("lea", setlist.id, { version: 1, parts: [{ name: null, songs: tooManySongs }] }))
        .status,
    ).toBe(400);
    expect(
      (await save("lea", setlist.id, { version: 1, parts: [{ name: null, songs: [otherSong] }] }))
        .status,
    ).toBe(400);
    await call(`/bands/${slug}/setlists/${setlist.id}/archive`, "lea", { method: "POST" });
    const archived = await save("lea", setlist.id, {
      version: 1,
      parts: [{ name: null, songs: [song.Africa] }],
    });
    expect(await errorOf(archived)).toBe("setlist_archived");
  });

  test("a song in a setlist can't be deleted: archive it instead", async () => {
    const res = await call(`/bands/${slug}/songs/${song.Linger}`, "lea", { method: "DELETE" });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe("song_in_use");
  });

  test("an archived song stays in its setlists", async () => {
    await call(`/bands/${slug}/songs/${song.Zombie}/archive`, "lea", { method: "POST" });
    const { setlists } = (await (await call(`/bands/${slug}/setlists`, "lea")).json()) as {
      setlists: { id: string; title: string }[];
    };
    const wedding = setlists.find((s) => s.title === "Wedding");
    const saved = await read(wedding?.id ?? "");
    expect(saved.parts[0]?.songs.map((s) => s.title)).toEqual(["Africa", "Zombie"]);
  });

  test("deleting the whole band deletes its setlists with their songs", async () => {
    await db.delete(bands).where(eq(bands.id, bandId));
    expect(await db.select().from(songs).where(eq(songs.bandId, bandId))).toEqual([]);
  });
});

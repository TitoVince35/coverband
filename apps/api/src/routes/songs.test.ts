import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_SONG_DURATION } from "@coverband/shared";
import { inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { activity, bandMembers, bands, users } from "../db/schema";
import { activityOf, createTestDeps } from "../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Song = {
  id: string;
  title: string;
  artist: string;
  standardDuration: number | null;
  ownDuration: number | null;
  addedBy?: string | null;
};

describe.skipIf(!databaseUrl)("songs of a band's repertoire", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `songs-${run}`;
  const otherSlug = `songs-other-${run}`;

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

  const add = (who: string, body: Record<string, unknown>, band = slug) =>
    call(`/bands/${band}/songs`, who, {
      method: "POST",
      body: { standardDuration: null, ownDuration: null, ...body },
    });
  const update = (who: string, id: string, body: Record<string, unknown>) =>
    call(`/bands/${slug}/songs/${id}`, who, { method: "PATCH", body });
  const songOf = async (res: Response) => ((await res.json()) as { song: Song }).song;

  beforeAll(async () => {
    const [band, other] = await db
      .insert(bands)
      .values([
        { name: `Songs ${run}`, slug },
        { name: `Other ${run}`, slug: otherSlug },
      ])
      .returning();
    const members = [
      ["lea", band?.id, "leader"],
      ["max", band?.id, "musician"],
      ["zoe", other?.id, "leader"],
    ] as const;
    for (const [who, bandId, role] of members) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: `${who} name` },
      });
      ids[who] = user.id;
      await db.insert(bandMembers).values({ bandId: bandId ?? "", userId: user.id, role });
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
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(bands).where(like(bands.slug, `songs-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("any member adds songs; the repertoire lists them by title", async () => {
    const res = await add("max", {
      title: "  Creep ",
      artist: "Radiohead",
      standardDuration: 238,
      ownDuration: 250,
    });
    expect(res.status).toBe(201);
    const creep = await songOf(res);
    expect(creep).toMatchObject({
      title: "Creep",
      artist: "Radiohead",
      standardDuration: 238,
      ownDuration: 250,
    });
    expect((await add("lea", { title: "abba medley", artist: "ABBA" })).status).toBe(201);

    const list = (await (await call(`/bands/${slug}/songs`, "lea")).json()) as { songs: Song[] };
    expect(list.songs.map((s) => s.title)).toEqual(["abba medley", "Creep"]);

    const one = await songOf(await call(`/bands/${slug}/songs/${creep.id}`, "lea"));
    expect(one).toMatchObject({ title: "Creep", addedBy: "max name" });
    expect(await activityOf(db, creep.id)).toMatchObject([
      { action: "song.added", actorId: ids.max, targetType: "song" },
    ]);
  });

  test("the same title and artist is a warning: refused until confirmed", async () => {
    const res = await add("lea", { title: "CREEP", artist: "radiohead" });
    expect(res.status).toBe(409);
    // It names the song it matches, for the warning.
    expect(((await res.json()) as { error: unknown }).error).toMatchObject({
      code: "song_duplicate",
      details: { title: "Creep", artist: "Radiohead" },
    });
    // Another version, told apart by its title, needs no confirmation.
    expect((await add("lea", { title: "Creep (acoustic)", artist: "Radiohead" })).status).toBe(201);
    const confirmed = await add("lea", {
      title: "Creep",
      artist: "Radiohead",
      confirmDuplicate: true,
    });
    expect(confirmed.status).toBe(201);
    // An accepted duplicate stays accepted: a duration, or the title's case, changes freely.
    const copy = await songOf(confirmed);
    expect((await update("lea", copy.id, { ownDuration: 200 })).status).toBe(200);
    expect((await update("lea", copy.id, { title: "CREEP" })).status).toBe(200);
    // Another band's repertoire doesn't count.
    expect((await add("zoe", { title: "Creep", artist: "Radiohead" }, otherSlug)).status).toBe(201);
  });

  test("members edit some fields; only real changes are recorded", async () => {
    const song = await songOf(await add("lea", { title: "Hey Jude", artist: "Beatles" }));
    const res = await update("max", song.id, { artist: "The Beatles", ownDuration: 431 });
    expect(res.status).toBe(200);
    expect(await songOf(res)).toMatchObject({
      title: "Hey Jude",
      artist: "The Beatles",
      ownDuration: 431,
      standardDuration: null,
    });
    // The same values again: nothing to record.
    expect((await update("max", song.id, { artist: "The Beatles" })).status).toBe(200);
    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.updated", actorId: ids.max, data: { fields: "artist,ownDuration" } },
    ]);
    // A duration can be removed.
    expect(await songOf(await update("lea", song.id, { ownDuration: null }))).toMatchObject({
      ownDuration: null,
    });
  });

  test("renaming a song into another one is a warning too, never with itself", async () => {
    const song = await songOf(await add("lea", { title: "Help", artist: "The Beatles" }));
    expect((await update("lea", song.id, { title: "help" })).status).toBe(200);
    const res = await update("lea", song.id, { title: "Hey Jude" });
    expect(res.status).toBe(409);
    expect(
      (await update("lea", song.id, { title: "Hey Jude", confirmDuplicate: true })).status,
    ).toBe(200);
  });

  test("a song's details: keys, tempo, style and notes", async () => {
    const song = await songOf(
      await add("max", { title: "Wonderwall", artist: "Oasis", key: "F#m", tempo: 87 }),
    );
    expect(song).toMatchObject({ key: "F#m", bandKey: null, tempo: 87, style: null, notes: null });
    const res = await update("lea", song.id, {
      bandKey: "Em",
      style: "  Britpop ",
      notes: "Capo 2\nWe skip the 2nd verse",
    });
    expect(await songOf(res)).toMatchObject({
      key: "F#m",
      bandKey: "Em",
      tempo: 87,
      style: "Britpop",
      notes: "Capo 2\nWe skip the 2nd verse",
    });
    // Blank text is no text.
    expect(await songOf(await update("lea", song.id, { style: "  ", tempo: null }))).toMatchObject({
      style: null,
      tempo: null,
    });
    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.updated", data: { fields: "bandKey,style,notes" } },
      { action: "song.updated", data: { fields: "tempo,style" } },
    ]);
  });

  test("only valid songs", async () => {
    const invalid = [
      { title: "", artist: "Someone" },
      { title: "   ", artist: "Someone" },
      { title: "Song", artist: "" },
      { title: "x".repeat(101), artist: "Someone" },
      { title: "Song", artist: "Someone", ownDuration: -1 },
      { title: "Song", artist: "Someone", ownDuration: MAX_SONG_DURATION + 1 },
      { title: "Song", artist: "Someone", standardDuration: 3.5 },
      { title: "Song", artist: "Someone", key: "H" },
      { title: "Song", artist: "Someone", bandKey: "Dbm" },
      { title: "Song", artist: "Someone", tempo: 10 },
      { title: "Song", artist: "Someone", tempo: 120.5 },
      { title: "Song", artist: "Someone", style: "x".repeat(51) },
      { title: "Song", artist: "Someone", notes: "x".repeat(2001) },
    ];
    for (const body of invalid) {
      expect((await add("lea", body)).status).toBe(400);
    }
  });

  test("only members, and only their band's songs", async () => {
    const song = await songOf(await add("lea", { title: "Private", artist: "Band" }));
    expect((await call(`/bands/${slug}/songs`, "nobody")).status).toBe(401);
    expect((await call(`/bands/${slug}/songs`, "zoe")).status).toBe(404);
    expect((await add("zoe", { title: "Intruder", artist: "Zoe" })).status).toBe(404);
    // Zoe's own band, another band's song id: not found.
    expect((await call(`/bands/${otherSlug}/songs/${song.id}`, "zoe")).status).toBe(404);
    const patch = call(`/bands/${otherSlug}/songs/${song.id}`, "zoe", {
      method: "PATCH",
      body: { title: "Mine now" },
    });
    expect((await patch).status).toBe(404);
    expect((await call(`/bands/${slug}/songs/not-a-uuid`, "lea")).status).toBe(400);
  });

  test("the journal names the song", async () => {
    const entries = (
      (await (await call(`/bands/${slug}/activity`, "lea")).json()) as {
        entries: { action: string; song?: string | null }[];
      }
    ).entries;
    expect(entries[0]).toMatchObject({ action: "song.added", song: "Private" });
    // The current title: "Help" was renamed since.
    const updates = entries.filter((e) => e.action === "song.updated").map((e) => e.song);
    expect(updates).toContain("Hey Jude");
    expect(updates).not.toContain("Help");
    // Other events carry no song.
    expect(entries.every((e) => e.action.startsWith("song.") || !("song" in e))).toBe(true);
  });
});

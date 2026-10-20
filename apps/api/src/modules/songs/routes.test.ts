import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_SONG_DURATION, MEDIA_LIMITS, SONG_MAX_LENGTH } from "@coverband/shared";
import { inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, users } from "../../core/db/schema";
import { activityOf, createTestDeps } from "../../test-deps";

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
  const { deps, db, sql, auth, lyrics } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

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

  test("lyrics: with one song only, their source follows them, their own event", async () => {
    const song = await songOf(await add("lea", { title: "Suzanne", artist: "Leonard Cohen" }));
    const get = async () => songOf(await call(`/bands/${slug}/songs/${song.id}`, "max"));
    expect(await get()).toMatchObject({ lyrics: null, lyricsSource: null });

    // Typed: the source is "typed", whatever was sent alone.
    await update("max", song.id, { lyricsSource: "lrclib" });
    expect(await get()).toMatchObject({ lyrics: null, lyricsSource: null });
    await update("max", song.id, { lyrics: "  Now I've heard there was a secret chord\n " });
    expect(await get()).toMatchObject({
      lyrics: "Now I've heard there was a secret chord",
      lyricsSource: "typed",
    });
    // The same lyrics: the source doesn't change either, and nothing is recorded.
    await update("max", song.id, {
      lyrics: "Now I've heard there was a secret chord",
      lyricsSource: "lrclib",
    });
    expect(await get()).toMatchObject({ lyricsSource: "typed" });
    // Fetched, then edited: still from LRCLIB.
    await update("lea", song.id, { lyrics: "Fetched lyrics", lyricsSource: "lrclib" });
    await update("lea", song.id, { lyrics: "Fetched lyrics, fixed" });
    expect(await get()).toMatchObject({ lyrics: "Fetched lyrics, fixed", lyricsSource: "lrclib" });
    // Cleared: no source either.
    await update("lea", song.id, { lyrics: "  " });
    expect(await get()).toMatchObject({ lyrics: null, lyricsSource: null });

    // Never in the repertoire's list.
    const list = (await (await call(`/bands/${slug}/songs`, "max")).json()) as {
      songs: Record<string, unknown>[];
    };
    expect(list.songs.find((s) => s.id === song.id)).not.toHaveProperty("lyrics");

    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.lyrics_changed", actorId: ids.max },
      { action: "song.lyrics_changed", actorId: ids.lea },
      { action: "song.lyrics_changed", actorId: ids.lea },
      { action: "song.lyrics_changed", actorId: ids.lea },
    ]);
    const tooLong = await update("lea", song.id, {
      lyrics: "a".repeat(SONG_MAX_LENGTH.lyrics + 1),
    });
    expect(tooLong.status).toBe(400);
  });

  test("lyrics search: ranked matches from the provider, nothing saved", async () => {
    const song = await songOf(
      await add("lea", { title: "Linger", artist: "The Cranberries", standardDuration: 275 }),
    );
    lyrics.entries = [
      {
        id: "1",
        title: "Linger",
        artist: "The Cranberries",
        album: "Live",
        duration: 300,
        lyrics: "If you, if you could return",
        instrumental: false,
      },
      {
        id: "2",
        title: "Linger",
        artist: "The Cranberries",
        album: "Everybody Else",
        duration: 274,
        lyrics: "If you, if you could return",
        instrumental: false,
      },
      {
        id: "3",
        title: "Linger",
        artist: "The Cranberries",
        album: null,
        duration: null,
        lyrics: null,
        instrumental: false,
      },
    ];
    const res = await call(`/bands/${slug}/songs/${song.id}/lyrics/search`, "max");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      instrumental: false,
      matches: [
        {
          id: "2",
          title: "Linger",
          artist: "The Cranberries",
          album: "Everybody Else",
          duration: 274,
          lyrics: "If you, if you could return",
        },
      ],
    });
    expect(lyrics.searches.at(-1)).toEqual({ title: "Linger", artist: "The Cranberries" });
    expect(await activityOf(db, song.id)).toMatchObject([{ action: "song.added" }]);

    // Only instrumentals found: said so, rather than "nothing found".
    lyrics.entries = [
      {
        id: "4",
        title: "Linger",
        artist: "The Cranberries",
        album: null,
        duration: 274,
        lyrics: null,
        instrumental: true,
      },
    ];
    const instrumental = await call(`/bands/${slug}/songs/${song.id}/lyrics/search`, "max");
    expect(await instrumental.json()).toEqual({ matches: [], instrumental: true });

    // Free text, instead of the title and artist (#138): it may be about other recordings, so it
    // never says the song is an instrumental.
    const free = await call(
      `/bands/${slug}/songs/${song.id}/lyrics/search?q=${encodeURIComponent(" Linger live ")}`,
      "max",
    );
    expect(lyrics.searches.at(-1)).toEqual({ text: "Linger live" });
    expect(await free.json()).toEqual({ matches: [], instrumental: false });
    await call(`/bands/${slug}/songs/${song.id}/lyrics/search?q=`, "max");
    expect(lyrics.searches.at(-1)).toEqual({ title: "Linger", artist: "The Cranberries" });

    // Another band's song, or the service down.
    expect((await call(`/bands/${slug}/songs/${song.id}/lyrics/search`, "zoe")).status).toBe(404);
    lyrics.down = true;
    const down = await call(`/bands/${slug}/songs/${song.id}/lyrics/search`, "max");
    lyrics.down = false;
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ error: { code: "lyrics_unavailable" } });
  });

  test("status and energy: a new song is proposed and not rated", async () => {
    const song = await songOf(await add("lea", { title: "Africa", artist: "Toto" }));
    expect(song).toMatchObject({ status: "proposed", energy: null });
    expect(await songOf(await update("max", song.id, { status: "learning" }))).toMatchObject({
      status: "learning",
    });
    // A new status is its own event; the other changes are listed apart.
    await update("lea", song.id, { status: "ready", energy: 3 });
    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.status_changed", actorId: ids.max, data: { status: "learning" } },
      { action: "song.status_changed", actorId: ids.lea, data: { status: "ready" } },
      { action: "song.updated", actorId: ids.lea, data: { fields: "energy" } },
    ]);
    expect(await songOf(await update("lea", song.id, { energy: null }))).toMatchObject({
      status: "ready",
      energy: null,
    });
    const journal = (
      (await (await call(`/bands/${slug}/activity`, "max")).json()) as {
        entries: { action: string; song?: string; status?: string | null }[];
      }
    ).entries;
    expect(journal.find((e) => e.action === "song.status_changed")).toMatchObject({
      song: "Africa",
      status: "ready",
    });
  });

  test("any member archives and restores; archived songs are listed apart", async () => {
    const song = await songOf(await add("lea", { title: "Macarena", artist: "Los del Rio" }));
    const archive = (who: string) =>
      call(`/bands/${slug}/songs/${song.id}/archive`, who, { method: "POST" });
    const titles = async (query = "") =>
      (
        (await (await call(`/bands/${slug}/songs${query}`, "lea")).json()) as { songs: Song[] }
      ).songs.map((s) => s.title);

    const res = await archive("max");
    expect(res.status).toBe(200);
    expect(((await songOf(res)) as Song & { archivedAt: string | null }).archivedAt).not.toBeNull();
    expect(await titles()).not.toContain("Macarena");
    expect(await titles("?archived=true")).toEqual(["Macarena"]);
    // Twice: nothing more happens.
    expect((await archive("lea")).status).toBe(200);
    // An archived song doesn't count as a duplicate.
    expect((await add("lea", { title: "Macarena", artist: "Los del Rio" })).status).toBe(201);

    const restored = await call(`/bands/${slug}/songs/${song.id}/restore`, "lea", {
      method: "POST",
    });
    expect(
      ((await songOf(restored)) as Song & { archivedAt: string | null }).archivedAt,
    ).toBeNull();
    expect(await titles("?archived=true")).toEqual([]);
    // Twice: nothing more happens either.
    expect(
      (await call(`/bands/${slug}/songs/${song.id}/restore`, "max", { method: "POST" })).status,
    ).toBe(200);
    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.archived", actorId: ids.max },
      { action: "song.restored", actorId: ids.lea },
    ]);
    expect((await archive("zoe")).status).toBe(404);
  });

  test("band leaders delete a song for good, unless something uses it", async () => {
    const song = await songOf(await add("max", { title: "Gangnam Style", artist: "Psy" }));
    const remove = (who: string) =>
      call(`/bands/${slug}/songs/${song.id}`, who, { method: "DELETE" });
    expect((await remove("max")).status).toBe(403);
    expect((await remove("zoe")).status).toBe(404);

    // Something referencing the song (as setlists will) refuses the deletion.
    await sql`create table test_song_uses_${sql.unsafe(run)} (song_id uuid references songs on delete restrict)`;
    try {
      await sql`insert into ${sql(`test_song_uses_${run}`)} values (${song.id})`;
      const refused = await remove("lea");
      expect(refused.status).toBe(409);
      expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
        "song_in_use",
      );
      expect((await call(`/bands/${slug}/songs/${song.id}`, "lea")).status).toBe(200);
    } finally {
      await sql`drop table ${sql(`test_song_uses_${run}`)}`;
    }

    expect((await remove("lea")).status).toBe(204);
    expect((await call(`/bands/${slug}/songs/${song.id}`, "lea")).status).toBe(404);
    expect((await remove("lea")).status).toBe(404);
    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.deleted", actorId: ids.lea },
    ]);
    // The journal still tells it, without the title.
    const journal = (
      (await (await call(`/bands/${slug}/activity`, "max")).json()) as {
        entries: { action: string; song?: string | null }[];
      }
    ).entries;
    expect(journal[0]).toMatchObject({ action: "song.deleted", song: null });
  });

  test("a song's links: members add, edit and remove them", async () => {
    const song = await songOf(
      await add("lea", { title: "Smells Like Teen Spirit", artist: "Nirvana" }),
    );
    const base = `/bands/${slug}/songs/${song.id}/media`;
    type Media = { id: string; url: string; title: string | null; instruments: unknown[] };
    const mediaOf = async (res: Response) => ((await res.json()) as { media: Media }).media;

    const res = await call(base, "max", {
      method: "POST",
      body: {
        url: " https://youtu.be/hTWKbfoikeg ",
        title: "Drums only",
        instruments: [{ label: "Batterie" }],
      },
    });
    expect(res.status).toBe(201);
    const video = await mediaOf(res);
    // Trimmed, and the instrument matched to its code.
    expect(video).toMatchObject({
      url: "https://youtu.be/hTWKbfoikeg",
      title: "Drums only",
      instruments: [{ code: "drums" }],
    });
    const tab = await mediaOf(
      await call(base, "lea", {
        method: "POST",
        body: { url: "https://tabs.example.com/teen-spirit" },
      }),
    );
    expect(tab).toMatchObject({ title: null, instruments: [] });

    // The song comes with its links, oldest first.
    const withMedia = (await (await call(`/bands/${slug}/songs/${song.id}`, "lea")).json()) as {
      song: { media: Media[] };
    };
    expect(withMedia.song.media.map((m) => m.id)).toEqual([video.id, tab.id]);

    const edited = await call(`${base}/${tab.id}`, "lea", {
      method: "PATCH",
      body: { title: "Guitar tab", instruments: [{ code: "guitar" }] },
    });
    expect(await mediaOf(edited)).toMatchObject({
      url: tab.url,
      title: "Guitar tab",
      instruments: [{ code: "guitar" }],
    });

    expect((await call(`${base}/${video.id}`, "max", { method: "DELETE" })).status).toBe(204);
    expect((await call(`${base}/${video.id}`, "max", { method: "DELETE" })).status).toBe(404);
    // Each change is a song update in the journal.
    expect(await activityOf(db, song.id)).toMatchObject([
      { action: "song.added" },
      { action: "song.updated", data: { fields: "media" } },
      { action: "song.updated", data: { fields: "media" } },
      { action: "song.updated", data: { fields: "media" } },
      { action: "song.updated", data: { fields: "media" } },
    ]);
  });

  test("links: http(s) only, members of the song's band only, a limit per song", async () => {
    const song = await songOf(await add("lea", { title: "Linked", artist: "Band" }));
    const base = `/bands/${slug}/songs/${song.id}/media`;
    const post = (who: string, body: unknown, path = base) =>
      call(path, who, { method: "POST", body });
    for (const url of ["javascript:alert(1)", "ftp://x.org/a", "youtube.com/watch", ""]) {
      expect((await post("lea", { url })).status).toBe(400);
    }
    expect((await post("lea", { url: "https://x.org", title: "x".repeat(101) })).status).toBe(400);
    expect((await post("zoe", { url: "https://x.org" })).status).toBe(404);
    // Zoe's own band, this band's song: not found.
    expect(
      (await post("zoe", { url: "https://x.org" }, `/bands/${otherSlug}/songs/${song.id}/media`))
        .status,
    ).toBe(404);
    const first = await post("lea", { url: "https://x.org/0" });
    const media = ((await first.json()) as { media: { id: string } }).media;
    expect(
      (
        await call(`/bands/${otherSlug}/songs/${song.id}/media/${media.id}`, "zoe", {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);
    for (let i = 1; i < MEDIA_LIMITS.perSong; i++) {
      expect((await post("lea", { url: `https://x.org/${i}` })).status).toBe(201);
    }
    const tooMany = await post("lea", { url: "https://x.org/one-too-many" });
    expect(tooMany.status).toBe(409);
    expect(((await tooMany.json()) as { error: { code: string } }).error.code).toBe(
      "too_many_links",
    );

    // Edits: the same rules, and only through the link's own song.
    const patch = (who: string, body: unknown, path = `${base}/${media.id}`) =>
      call(path, who, { method: "PATCH", body });
    expect((await patch("lea", { url: "javascript:alert(1)" })).status).toBe(400);
    expect(await (await patch("lea", { title: "  " })).json()).toMatchObject({
      media: { title: null },
    });
    expect(
      (
        await patch(
          "zoe",
          { title: "Mine" },
          `/bands/${otherSlug}/songs/${song.id}/media/${media.id}`,
        )
      ).status,
    ).toBe(404);
    const other = await songOf(await add("lea", { title: "Other song", artist: "Band" }));
    const elsewhere = `/bands/${slug}/songs/${other.id}/media/${media.id}`;
    expect((await patch("lea", { title: "Moved" }, elsewhere)).status).toBe(404);
    expect((await call(elsewhere, "lea", { method: "DELETE" })).status).toBe(404);
    expect((await call(`/bands/${otherSlug}/songs/${song.id}`, "zoe")).status).toBe(404);
  });

  test("the whole repertoire, as each song's page shows it, for offline use (#165)", async () => {
    const res = await call(`/bands/${slug}/songs/details`, "max");
    expect(res.status).toBe(200);
    const { songs } = (await res.json()) as {
      songs: (Song & { archivedAt: string | null; media: unknown[] })[];
    };
    const list = (await (await call(`/bands/${slug}/songs`, "max")).json()) as { songs: Song[] };
    // The current songs only, in the repertoire's order.
    expect(songs.map((song) => song.id)).toEqual(list.songs.map((song) => song.id));
    expect(songs.every((song) => song.archivedAt === null)).toBe(true);
    for (const song of songs) {
      const page = await songOf(await call(`/bands/${slug}/songs/${song.id}`, "max"));
      expect(song).toEqual(page as typeof song);
    }
    expect(songs.some((song) => song.media.length > 0)).toBe(true);
    expect((await call(`/bands/${slug}/songs/details`, "zoe")).status).toBe(404);
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
      { title: "Song", artist: "Someone", status: "done" },
      { title: "Song", artist: "Someone", energy: 0 },
      { title: "Song", artist: "Someone", energy: 4 },
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

  test("the journal names the song, by its current title", async () => {
    const song = await songOf(await add("lea", { title: "Hallelujah", artist: "Leonard Cohen" }));
    await update("max", song.id, { title: "Hallelujah (Buckley)", artist: "Jeff Buckley" });
    const entries = (
      (await (await call(`/bands/${slug}/activity`, "lea")).json()) as {
        entries: { action: string; song?: string | null }[];
      }
    ).entries;
    expect(entries.slice(0, 2)).toMatchObject([
      { action: "song.updated", song: "Hallelujah (Buckley)" },
      { action: "song.added", song: "Hallelujah (Buckley)" },
    ]);
    // Other events carry no song.
    expect(entries.every((e) => e.action.startsWith("song.") || !("song" in e))).toBe(true);
  });
});

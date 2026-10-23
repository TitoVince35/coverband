import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DOCUMENT_LIMITS } from "@coverband/shared";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, songDocuments, songs, users } from "../../core/db/schema";
import { activityOf, createTestDeps, JPEG } from "../../test-deps";
import { fileName } from "./documents-routes";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Document = {
  id: string;
  title: string;
  kind: string;
  instruments: unknown[];
  addedBy: string | null;
  addedById: string | null;
  url: string;
};

describe.skipIf(!databaseUrl)("a song's documents (#238)", () => {
  const { deps, db, sql, auth, storage } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `docs-${run}`;
  let bandId = "";
  let songId = "";
  const pdf = new TextEncoder().encode("%PDF-1.7\nhorns");

  const base = () => `/api/bands/${slug}/songs/${songId}/documents`;
  const request = (who: string, path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { cookie: cookies[who] ?? "", origin: "http://localhost:3000", ...init.headers },
    });
  function upload(
    who: string,
    file: { bytes: Uint8Array; name: string },
    fields: Record<string, string> = { title: "Horns" },
  ) {
    const form = new FormData();
    form.set("file", new File([file.bytes], file.name));
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    return request(who, base(), { method: "POST", body: form });
  }
  const json = (who: string, path: string, method: string, body?: unknown) =>
    request(who, path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const documentOf = async (res: Response) =>
    ((await res.json()) as { document: Document }).document;

  beforeAll(async () => {
    const [band] = await db
      .insert(bands)
      .values({ name: `Docs ${run}`, slug })
      .returning();
    bandId = band?.id ?? "";
    for (const [who, role] of [
      ["lea", "leader"],
      ["max", "musician"],
      ["sam", "musician"],
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
    const [song] = await db
      .insert(songs)
      .values({ bandId, title: "Zombie", artist: "The Cranberries", createdById: ids.lea })
      .returning();
    songId = song?.id ?? "";
  });

  afterAll(async () => {
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(bands).where(like(bands.slug, `docs-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("a member adds a PDF: its type from its bytes, listed with the song, its file served", async () => {
    const res = await upload(
      "max",
      { bytes: pdf, name: "horns.pdf" },
      {
        title: " Horns ",
        instruments: JSON.stringify([{ code: "trumpet" }, { label: "trombone" }]),
      },
    );
    expect(res.status).toBe(201);
    const document = await documentOf(res);
    expect(document).toMatchObject({
      title: "Horns",
      kind: "pdf",
      addedBy: "max name",
      addedById: ids.max,
      url: `/api/bands/${slug}/songs/${songId}/documents/${document.id}/file`,
    });
    // Free text matching a known instrument becomes its code.
    expect(document.instruments).toEqual([{ code: "trumpet" }, { code: "trombone" }]);

    const song = (await (await request("sam", `/api/bands/${slug}/songs/${songId}`)).json()) as {
      song: { documents: Document[] };
    };
    expect(song.song.documents.map((d) => d.id)).toEqual([document.id]);
    const details = (await (await request("sam", `/api/bands/${slug}/songs/details`)).json()) as {
      songs: { id: string; documents: Document[] }[];
    };
    expect(details.songs.find((s) => s.id === songId)?.documents).toHaveLength(1);

    const file = await request("sam", document.url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toBe(`inline; ${fileName("Horns", "pdf")}`);
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
    expect((await activityOf(db, songId)).at(-1)).toMatchObject({
      action: "song.document_added",
      actorId: ids.max,
      data: { kind: "pdf" },
    });
  });

  test("Guitar Pro and MuseScore files are downloads; photos are photos whatever their name", async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
    const score = await documentOf(await upload("lea", { bytes: zip, name: "Zombie.mscz" }));
    expect(score.kind).toBe("musescore");
    const file = await request("lea", score.url);
    expect(file.headers.get("content-type")).toBe("application/octet-stream");
    expect(file.headers.get("content-disposition")).toStartWith("attachment;");
    const photo = await documentOf(await upload("lea", { bytes: JPEG, name: "image.png" }));
    expect(photo.kind).toBe("photo");
    expect((await request("lea", photo.url)).headers.get("content-type")).toBe("image/jpeg");
  });

  test("refused: other files, too large, no title, outsiders", async () => {
    const code = async (res: Response) =>
      ((await res.json()) as { error: { code: string } }).error.code;
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(await code(await upload("max", { bytes: svg, name: "chords.svg" }))).toBe(
      "document_invalid",
    );
    const big = new Uint8Array(DOCUMENT_LIMITS.maxBytes + 1);
    big.set(pdf);
    const tooLarge = await upload("max", { bytes: big, name: "big.pdf" });
    expect(tooLarge.status).toBe(413);
    expect(await code(tooLarge)).toBe("document_too_large");
    expect((await upload("max", { bytes: pdf, name: "a.pdf" }, { title: " " })).status).toBe(400);
    expect((await upload("nobody", { bytes: pdf, name: "a.pdf" })).status).toBe(401);
    // Nothing stored for the refused ones: one file per document.
    const rows = await db.select().from(songDocuments).where(eq(songDocuments.bandId, bandId));
    expect(storage.objects.size).toBe(rows.length);
  });

  test("any member edits; who added it or the band leader deletes", async () => {
    const res = await upload("max", { bytes: pdf, name: "chords.pdf" }, { title: "Chords" });
    const document = await documentOf(res);
    const edited = await json("sam", `${base()}/${document.id}`, "PATCH", {
      title: "Chord grid",
      instruments: [{ code: "guitar" }],
    });
    expect(edited.status).toBe(200);
    expect(await documentOf(edited)).toMatchObject({
      title: "Chord grid",
      instruments: [{ code: "guitar" }],
    });
    expect((await activityOf(db, songId)).at(-1)).toMatchObject({
      action: "song.updated",
      data: { fields: "documents" },
    });

    const key = (await db.select().from(songDocuments).where(eq(songDocuments.id, document.id)))[0]
      ?.storageKey;
    // Another musician: refused.
    expect((await json("sam", `${base()}/${document.id}`, "DELETE")).status).toBe(403);
    // Who added it: deleted, and its file.
    expect((await json("max", `${base()}/${document.id}`, "DELETE")).status).toBe(204);
    expect(storage.objects.has(key ?? "")).toBe(false);
    expect((await json("max", `${base()}/${document.id}`, "DELETE")).status).toBe(404);
    expect((await request("max", document.url)).status).toBe(404);
    expect((await activityOf(db, songId)).at(-1)).toMatchObject({
      action: "song.document_removed",
      actorId: ids.max,
    });
    // The band leader deletes anyone's.
    const other = await documentOf(
      await upload("sam", { bytes: pdf, name: "x.pdf" }, { title: "X" }),
    );
    expect((await json("lea", `${base()}/${other.id}`, "DELETE")).status).toBe(204);
  });

  test(`at most ${DOCUMENT_LIMITS.perSong} per song`, async () => {
    const [{ n }] =
      (await sql`select count(*)::int as n from song_documents where song_id = ${songId}`) as unknown as [
        { n: number },
      ];
    for (let i = n; i < DOCUMENT_LIMITS.perSong; i++) {
      expect(
        (await upload("lea", { bytes: pdf, name: `${i}.pdf` }, { title: `Part ${i}` })).status,
      ).toBe(201);
    }
    const over = await upload("lea", { bytes: pdf, name: "over.pdf" }, { title: "Over" });
    expect(over.status).toBe(409);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe(
      "too_many_documents",
    );
  });

  test("the band's storage budget", async () => {
    const [song] = await db
      .insert(songs)
      .values({ bandId, title: "Linger", artist: "The Cranberries" })
      .returning();
    // Filled up by a (fake) large document.
    await db.insert(songDocuments).values({
      bandId,
      songId: song?.id ?? "",
      title: "Huge",
      kind: "pdf",
      contentType: "application/pdf",
      extension: "pdf",
      size: DOCUMENT_LIMITS.perBand,
      storageKey: `bands/${bandId}/documents/huge.pdf`,
    });
    const res = await request("lea", `/api/bands/${slug}/songs/${song?.id}/documents`, {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("file", new File([pdf], "a.pdf"));
        form.set("title", "A");
        return form;
      })(),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "band_storage_full",
    );
  });

  test("deleting the song deletes its documents' files", async () => {
    const before = [...storage.objects.keys()].filter((key) => key.includes(bandId));
    expect(before.length).toBeGreaterThan(0);
    expect((await json("lea", `/api/bands/${slug}/songs/${songId}`, "DELETE")).status).toBe(204);
    const rows = await db.select().from(songDocuments).where(eq(songDocuments.songId, songId));
    expect(rows).toHaveLength(0);
    const stored = (
      await db.select().from(songDocuments).where(eq(songDocuments.bandId, bandId))
    ).map((row) => row.storageKey);
    expect([...storage.objects.keys()].filter((key) => key.includes(bandId)).sort()).toEqual(
      stored.filter((key) => storage.objects.has(key)).sort(),
    );
  });

  test("fileName: ASCII and UTF-8 forms, never quotes", () => {
    expect(fileName('Grille "Sol"', "pdf")).toBe(
      `filename="Grille Sol.pdf"; filename*=UTF-8''Grille%20%22Sol%22.pdf`,
    );
    expect(fileName("Accords é", "jpg")).toBe(
      `filename="Accords e.jpg"; filename*=UTF-8''Accords%20%C3%A9.jpg`,
    );
  });
});

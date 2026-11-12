import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import JSZip from "jszip";
import sharp from "sharp";
import { createApp } from "../../app";
import {
  activity,
  bandMembers,
  bands,
  rateLimits,
  setlistExports,
  songs,
  users,
} from "../../core/db/schema";
import { createTestDeps } from "../../test-deps";
import { deleteBand } from "../admin/service";
import { SETLIST_EXPORTS } from "./routes";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe.skipIf(!databaseUrl)("setlist exports (brief 030, #297)", () => {
  const { deps, db, sql, auth, storage } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `setlist-exports-${run}`;
  let bandId = "";
  let songId = "";
  let setlistId = "";

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

  const exportOf = (who: string, query = "?lang=en&tz=Europe/Paris", id = setlistId) =>
    call(`/bands/${slug}/setlists/${id}/exports/docx${query}`, who);
  const bodyText = async (res: Response) => {
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    return ((await zip.file("word/document.xml")?.async("string")) ?? "").replace(/<[^>]+>/g, "");
  };
  const exportRows = () =>
    db
      .select({ fileKey: setlistExports.fileKey, language: setlistExports.language })
      .from(setlistExports)
      .where(eq(setlistExports.setlistId, setlistId));

  beforeAll(async () => {
    const [band] = await db
      .insert(bands)
      .values({ name: `Exports ${run}`, slug })
      .returning();
    bandId = band?.id ?? "";
    for (const [who, role, bandOf] of [
      ["lea", "leader", bandId],
      ["max", "musician", bandId],
      ["zoe", null, null],
    ] as const) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: `${who} name` },
      });
      ids[who] = user.id;
      if (role && bandOf)
        await db.insert(bandMembers).values({ bandId: bandOf, userId: user.id, role });
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
      .values({ bandId, title: "Rock", artist: "Band", standardDuration: 245, key: "Em" })
      .returning();
    songId = song?.id ?? "";
    const created = await call(`/bands/${slug}/setlists`, "lea", {
      method: "POST",
      body: { title: "Wedding" },
    });
    setlistId = ((await created.json()) as { setlist: { id: string } }).setlist.id;
    await call(`/bands/${slug}/setlists/${setlistId}/content`, "lea", {
      method: "PUT",
      body: { version: 1, parts: [{ name: "Set 1", songs: [songId] }] },
    });
  });

  afterAll(async () => {
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(rateLimits).where(like(rateLimits.key, `%${ids.max}`));
    await db.delete(bands).where(like(bands.slug, `setlist-exports-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("a member downloads the docx, named after the setlist", async () => {
    const res = await exportOf("max");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(DOCX);
    expect(res.headers.get("content-disposition")).toStartWith(
      'attachment; filename="Wedding.docx"',
    );
    expect(await bodyText(res)).toContain("1. Rock - Band - Em - 4:05");
    const rows = await exportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fileKey).toStartWith(`bands/${bandId}/setlists/${setlistId}/exports/`);
    expect(storage.objects.has(rows[0]?.fileKey ?? "")).toBe(true);
  });

  test("unchanged: the stored file is served, not made again (nor counted)", async () => {
    const [before] = await exportRows();
    const [limit] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, `coverband:${SETLIST_EXPORTS.name}:${ids.max}`));
    expect((await exportOf("max")).status).toBe(200);
    expect(await exportRows()).toEqual([before ?? { fileKey: "", language: "" }]);
    const [after] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, `coverband:${SETLIST_EXPORTS.name}:${ids.max}`));
    expect(after?.count).toBe(limit?.count ?? -1);
  });

  test("a song renamed: a new file, the old one deleted", async () => {
    const [before] = await exportRows();
    await db.update(songs).set({ title: "Rock on" }).where(eq(songs.id, songId));
    const res = await exportOf("max");
    expect(await bodyText(res)).toContain("Rock on");
    const [after] = await exportRows();
    expect(after?.fileKey).not.toBe(before?.fileKey);
    expect(storage.objects.has(before?.fileKey ?? "")).toBe(false);
    expect(storage.objects.has(after?.fileKey ?? "")).toBe(true);
  });

  test("one file per language: French, from the query or the request's language", async () => {
    const res = await exportOf("max", "?lang=fr");
    expect(await bodyText(res)).toContain("Set 1");
    expect((await exportRows()).map((row) => row.language).sort()).toEqual(["en", "fr"]);
    const header = await app.request(`/api/bands/${slug}/setlists/${setlistId}/exports/docx`, {
      headers: { cookie: cookies.max ?? "", "accept-language": "fr-FR,fr;q=0.9" },
    });
    expect(header.status).toBe(200);
    expect(await exportRows()).toHaveLength(2);
  });

  test("a WebP logo is converted for the document", async () => {
    const webp = await sharp({
      create: { width: 300, height: 100, channels: 4, background: "#08f" },
    })
      .webp()
      .toBuffer();
    const key = `bands/${bandId}/logo/${crypto.randomUUID()}.webp`;
    await storage.put(key, new Uint8Array(webp), "image/webp");
    await db.update(bands).set({ logoKey: key }).where(eq(bands.id, bandId));
    const res = await exportOf("max");
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const media = Object.keys(zip.files).filter((name) => /^word\/media\/.+[^/]$/.test(name));
    expect(media).toHaveLength(1);
    const image = await zip.file(media[0] ?? "")?.async("uint8array");
    expect((await sharp(image).metadata()).format).toBe("png");
  });

  test("over the limit: 429, while stored files are still served", async () => {
    const key = `coverband:${SETLIST_EXPORTS.name}:${ids.max}`;
    await db
      .insert(rateLimits)
      .values({ key, count: SETLIST_EXPORTS.max, lastRequest: Date.now() })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: SETLIST_EXPORTS.max, lastRequest: Date.now() },
      });
    expect((await exportOf("max")).status).toBe(200);
    await db.update(songs).set({ title: "Rock again" }).where(eq(songs.id, songId));
    const res = await exportOf("max");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
    expect((await exportOf("lea")).status).toBe(200);
  });

  test("the PDF opens in the browser (inline), with its own stored file", async () => {
    const res = await call(`/bands/${slug}/setlists/${setlistId}/exports/pdf?lang=en`, "lea");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toStartWith('inline; filename="Wedding.pdf"');
    expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    expect(await exportRows()).toHaveLength(3);
  });

  test("non-members get a 404; an unknown format or setlist too", async () => {
    expect((await exportOf("zoe")).status).toBe(404);
    expect((await call(`/bands/${slug}/setlists/${setlistId}/exports/odt`, "max")).status).toBe(
      400,
    );
    expect((await exportOf("max", "", crypto.randomUUID())).status).toBe(404);
  });

  test("deleting the setlist deletes its files", async () => {
    const keys = (await exportRows()).map((row) => row.fileKey);
    expect(keys.length).toBeGreaterThan(0);
    const res = await call(`/bands/${slug}/setlists/${setlistId}`, "lea", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(keys.filter((key) => storage.objects.has(key))).toEqual([]);
  });

  test("deleting the band deletes its exports' files", async () => {
    const created = await call(`/bands/${slug}/setlists`, "lea", {
      method: "POST",
      body: { title: "Other" },
    });
    setlistId = ((await created.json()) as { setlist: { id: string } }).setlist.id;
    expect((await exportOf("lea")).status).toBe(200);
    const keys = (await exportRows()).map((row) => row.fileKey);
    await db.update(bands).set({ disabledAt: new Date() }).where(eq(bands.id, bandId));
    await deleteBand(deps, bandId, `Exports ${run}`, ids.lea ?? "");
    expect(keys.filter((key) => storage.objects.has(key))).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, users } from "../../core/db/schema";
import { createTestDeps } from "../../test-deps";
import { JOURNAL_SIZE } from "./service";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Entry = { action: string; createdAt: string; actorName: string | null; genre?: string | null };

describe.skipIf(!databaseUrl)("band journal", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `journal-${run}`;
  const otherSlug = `journal-other-${run}`;

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

  const journal = async (who: string) => {
    const res = await call(`/bands/${slug}/activity`, who);
    return { res, entries: res.ok ? ((await res.json()) as { entries: Entry[] }).entries : [] };
  };

  beforeAll(async () => {
    const [band, other] = await db
      .insert(bands)
      .values([
        { name: `Journal ${run}`, slug },
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
    await db.delete(bands).where(like(bands.slug, `journal-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("members see their band's latest events, newest first, with names", async () => {
    await call(`/bands/${slug}`, "lea", { method: "PATCH", body: { genre: "Funk" } });
    await call(`/bands/${slug}/invitations`, "lea", {
      method: "POST",
      body: { email: email("guest"), language: "en" },
    });
    await call(`/bands/${slug}/members/me/instruments`, "max", {
      method: "PUT",
      body: { instruments: [{ code: "drums" }, { label: "Kazoo" }] },
    });
    // Elsewhere, or without a band: not in this journal.
    await call(`/bands/${otherSlug}`, "zoe", { method: "PATCH", body: { genre: "Jazz" } });
    await call("/me", "max", { method: "PATCH", body: { firstName: "Max", lastName: "Moe" } });

    const { res, entries } = await journal("max");
    expect(res.status).toBe(200);
    expect(entries.map((e) => [e.action, e.actorName])).toEqual([
      ["member.instruments_changed", "Max Moe"],
      ["invitation.sent", "lea name"],
      ["band.genre_changed", "lea name"],
    ]);
    expect(entries[2]?.genre).toBe("Funk");
    // Only what a sentence needs: no email, no free text, no ids of other rows.
    const raw = JSON.stringify(entries);
    expect(raw).not.toContain("@");
    expect(raw).not.toContain("Kazoo");
    expect(raw).not.toContain(ids.max ?? "");
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual([
      "action",
      "actorName",
      "createdAt",
      "id",
    ]);
  });

  test('a band leader\'s joining is said by "created the band" alone', async () => {
    const [band] = await db.select({ id: bands.id }).from(bands).where(eq(bands.slug, slug));
    await db.insert(activity).values([
      {
        action: "band.created",
        bandId: band?.id,
        actorId: ids.lea,
        targetType: "band",
        targetId: band?.id ?? "",
      },
      {
        action: "member.joined",
        bandId: band?.id,
        actorId: ids.lea,
        targetType: "user",
        targetId: ids.lea ?? "",
        data: { role: "leader" },
      },
      {
        action: "member.joined",
        bandId: band?.id,
        actorId: ids.max,
        targetType: "user",
        targetId: ids.max ?? "",
        data: { role: "musician" },
      },
      // Without a role (older or seeded rows): still shown.
      {
        action: "member.joined",
        bandId: band?.id,
        actorId: ids.max,
        targetType: "user",
        targetId: ids.max ?? "",
      },
    ]);
    const { entries } = await journal("max");
    const joined = entries.filter((e) => e.action === "member.joined");
    expect(joined.map((e) => e.actorName)).toEqual(["Max Moe", "Max Moe"]);
    expect(entries.some((e) => e.action === "band.created")).toBe(true);
  });

  test("non-members get a 404", async () => {
    expect((await journal("zoe")).res.status).toBe(404);
    expect((await journal("nobody")).res.status).toBe(401);
  });

  test("at most the latest entries; a removed genre; a deleted account", async () => {
    for (let i = 0; i < JOURNAL_SIZE + 2; i++) {
      await call(`/bands/${slug}`, "lea", { method: "PATCH", body: { genre: `Genre ${i}` } });
    }
    await call(`/bands/${slug}`, "lea", { method: "PATCH", body: { genre: null } });
    let { entries } = await journal("max");
    expect(entries).toHaveLength(JOURNAL_SIZE);
    expect(entries[0]).toMatchObject({ action: "band.genre_changed", genre: null });
    expect(entries[1]?.genre).toBe(`Genre ${JOURNAL_SIZE + 1}`);

    // Lea's account is deleted: her entries stay, without a name.
    await db.delete(users).where(eq(users.id, ids.lea ?? ""));
    ({ entries } = await journal("max"));
    expect(entries[0]?.actorName).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { activity, bandMembers, bands, memberInstruments, users } from "../db/schema";
import { cleanInstruments, MAX_INSTRUMENTS } from "../instruments";
import { activityOf, createTestDeps } from "../test-deps";

test("cleanInstruments checks, dedupes and caps a list, keeping its order", () => {
  expect(
    cleanInstruments([
      { label: "Chant" },
      { code: "guitar" },
      { code: "kazoo" },
      { label: "  " },
      { code: "vocals" },
      { label: "KAZOO" },
      "piano",
    ]),
  ).toEqual([{ code: "vocals" }, { code: "guitar" }, { label: "kazoo" }]);
  const many = Array.from({ length: 15 }, (_, i) => ({ label: `Thing ${i}` }));
  expect(cleanInstruments(many)).toHaveLength(MAX_INSTRUMENTS);
});

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("instruments per band membership", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slugs = { one: `one-${run}`, two: `two-${run}`, three: `three-${run}` };

  function call(path: string, who: string, init: { method?: string; body?: unknown } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", cookie: cookies[who] ?? "" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  const bandIdOf = async (slug: string) =>
    (await db.select({ id: bands.id }).from(bands).where(eq(bands.slug, slug)))[0]?.id ?? "";

  const setMine = (who: string, slug: string, instruments: unknown) =>
    call(`/bands/${slug}/members/me/instruments`, who, { method: "PUT", body: { instruments } });

  beforeAll(async () => {
    const created = await db
      .insert(bands)
      .values(Object.values(slugs).map((slug) => ({ name: `Band ${slug}`, slug })))
      .returning();
    const bandId = (slug: string) => created.find((b) => b.slug === slug)?.id ?? "";
    // amy plays in bands one and two; bob in one; cat in three.
    const memberships = { amy: ["one", "two"], bob: ["one"], cat: ["three"] } as const;
    for (const [who, bandsOf] of Object.entries(memberships)) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: who },
      });
      ids[who] = user.id;
      for (const key of bandsOf) {
        await db
          .insert(bandMembers)
          .values({ bandId: bandId(slugs[key]), userId: user.id, role: "musician" });
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
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(bands).where(like(bands.slug, `%-${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("members set their own instruments in a band; the lineup shows them in order", async () => {
    const res = await setMine("amy", slugs.one, [{ code: "bass_guitar" }, { label: "Chœurs" }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      instruments: [{ code: "bass_guitar" }, { code: "vocals" }],
    });

    const lineup = (await (await call(`/bands/${slugs.one}/members`, "bob")).json()) as {
      members: { userId: string; instruments: unknown[] }[];
    };
    expect(lineup.members.find((m) => m.userId === ids.amy)?.instruments).toEqual([
      { code: "bass_guitar" },
      { code: "vocals" },
    ]);
    // Per band: nothing changed in amy's other band.
    const two = (await (await call(`/bands/${slugs.two}`, "amy")).json()) as {
      membership: { instruments: unknown[] };
    };
    expect(two.membership.instruments).toEqual([]);

    expect(await activityOf(db, ids.amy ?? "")).toMatchObject([
      {
        action: "member.instruments_changed",
        actorId: ids.amy,
        data: { codes: "bass_guitar,vocals", custom: 0 },
      },
    ]);
  });

  test("saves at the same moment all succeed; one whole list wins", async () => {
    const lists = [
      [{ code: "drums" }, { code: "vocals" }],
      [{ code: "piano" }],
      [{ code: "flute" }, { code: "harmonica" }, { code: "banjo" }],
      [{ code: "cello" }],
    ];
    // A double tap or two tabs, many times over.
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => setMine("amy", slugs.two, lists[i % lists.length])),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(200));
    const two = (await (await call(`/bands/${slugs.two}`, "amy")).json()) as {
      membership: { instruments: { code: string }[] };
    };
    // Never a mix of two lists.
    expect(lists).toContainEqual(two.membership.instruments);
  });

  test("only members, valid lists only", async () => {
    expect((await setMine("nobody", slugs.one, [])).status).toBe(401);
    expect((await setMine("cat", slugs.one, [{ code: "drums" }])).status).toBe(404);
    const tooMany = Array.from({ length: MAX_INSTRUMENTS + 1 }, () => ({ code: "drums" }));
    expect((await setMine("bob", slugs.one, tooMany)).status).toBe(400);
    expect((await setMine("bob", slugs.one, [{ label: "x".repeat(51) }])).status).toBe(400);
    expect((await setMine("bob", slugs.one, "drums")).status).toBe(400);
    // An empty list clears them.
    expect(await (await setMine("bob", slugs.one, [])).json()).toEqual({ instruments: [] });
  });

  test("free text is suggested to every band once two bands use it", async () => {
    const suggestions = async () =>
      ((await (await call("/instruments/suggestions", "cat")).json()) as { labels: string[] })
        .labels;
    const theremin = `Theremin ${run}`;
    await setMine("amy", slugs.one, [{ label: theremin }]);
    expect(await suggestions()).not.toContain(theremin);
    // The same person in their two bands: still private.
    await setMine("amy", slugs.two, [{ label: theremin.toUpperCase() }]);
    expect(await suggestions()).not.toContain(theremin);

    // Someone else too: suggested, as typed most often.
    await setMine("bob", slugs.one, [{ label: theremin }]);
    expect(await suggestions()).toContain(theremin);

    // Free text naming a known instrument (older values) is never offered as custom.
    await db.insert(memberInstruments).values([
      { bandId: await bandIdOf(slugs.two), userId: ids.amy ?? "", position: 5, label: "Choeurs" },
      { bandId: await bandIdOf(slugs.three), userId: ids.cat ?? "", position: 0, label: "Choeurs" },
    ]);
    expect(await suggestions()).not.toContain("Choeurs");
    expect((await call("/instruments/suggestions", "nobody")).status).toBe(401);
  });

  test("leaving a band takes its instruments with the membership", async () => {
    await db.delete(bandMembers).where(eq(bandMembers.userId, ids.bob ?? ""));
    const rows = await db
      .select()
      .from(memberInstruments)
      .where(eq(memberInstruments.userId, ids.bob ?? ""));
    expect(rows).toHaveLength(0);
  });
});

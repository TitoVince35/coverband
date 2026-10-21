import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, rateLimits, users } from "../../core/db/schema";
import { createTestDeps } from "../../test-deps";
import { AUTOFILL_SEARCHES } from "./routes";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("autofill", () => {
  const { deps, db, sql, auth, catalog } = createTestDeps(databaseUrl);
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
    expect(await res.json()).toEqual({ track: catalog.track });
    expect(catalog.searches.at(-1)).toEqual(zombie);

    catalog.track = null;
    expect(await (await search("lea", zombie)).json()).toEqual({ track: null });
  });

  test(`${AUTOFILL_SEARCHES.max} searches a day per band, whoever searches`, async () => {
    // The band has searched twice already (above; the refused ones don't count).
    for (let i = 2; i < AUTOFILL_SEARCHES.max; i++) {
      expect((await search(i % 2 ? "lea" : "max", zombie)).status).toBe(200);
    }
    const over = await search("lea", zombie);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another band has its own quota.
    expect((await search("zoe", zombie, `autofill-other-${run}`)).status).toBe(200);
  });
});

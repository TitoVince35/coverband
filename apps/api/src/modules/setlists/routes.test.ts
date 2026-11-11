import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SETLIST_LIMITS } from "@coverband/shared";
import { inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, bandMembers, bands, setlists, users } from "../../core/db/schema";
import { activityOf, createTestDeps } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Setlist = {
  id: string;
  title: string;
  createdBy: string | null;
  archivedAt: string | null;
};

describe.skipIf(!databaseUrl)("a band's setlists", () => {
  const { deps, db, sql, auth } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `setlists-${run}`;
  const otherSlug = `setlists-other-${run}`;
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

  const create = (who: string, title: string, band = slug) =>
    call(`/bands/${band}/setlists`, who, { method: "POST", body: { title } });
  const setlistOf = async (res: Response) => ((await res.json()) as { setlist: Setlist }).setlist;
  const listOf = async (who: string, archived = false) =>
    (
      (await (
        await call(`/bands/${slug}/setlists${archived ? "?archived=true" : ""}`, who)
      ).json()) as { setlists: Setlist[] }
    ).setlists;
  const errorOf = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;

  beforeAll(async () => {
    const [band, other] = await db
      .insert(bands)
      .values([
        { name: `Setlists ${run}`, slug },
        { name: `Setlists other ${run}`, slug: otherSlug },
      ])
      .returning();
    bandId = band?.id ?? "";
    const members = [
      ["lea", band?.id, "leader"],
      ["max", band?.id, "musician"],
      ["sam", band?.id, "musician"],
      ["zoe", other?.id, "leader"],
    ] as const;
    for (const [who, id, role] of members) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: `${who} name` },
      });
      ids[who] = user.id;
      await db.insert(bandMembers).values({ bandId: id ?? "", userId: user.id, role });
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
    await db.delete(bands).where(like(bands.slug, `setlists-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("a member creates a setlist, listed with its author", async () => {
    const res = await create("max", "  Wedding, full night ");
    expect(res.status).toBe(201);
    const setlist = await setlistOf(res);
    expect(setlist).toMatchObject({ title: "Wedding, full night", createdBy: "max name" });
    expect((await listOf("lea")).map((s) => s.title)).toContain("Wedding, full night");
    expect(await activityOf(db, setlist.id)).toEqual([
      {
        action: "setlist.created",
        actorId: ids.max ?? "",
        bandId,
        data: null,
        targetType: "setlist",
      },
    ]);
  });

  test("a title is unique within the band, whatever its case; other bands are free", async () => {
    await create("lea", "Bar gig");
    const again = await create("max", "BAR GIG");
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe("setlist_title_taken");
    expect((await create("zoe", "Bar gig", otherSlug)).status).toBe(201);
  });

  test("a blank title is refused", async () => {
    expect((await create("lea", "   ")).status).toBe(400);
  });

  test("non-members get a 404", async () => {
    expect((await call(`/bands/${slug}/setlists`, "zoe")).status).toBe(404);
  });

  test("a member renames a setlist; a taken title is refused", async () => {
    const setlist = await setlistOf(await create("max", "Rehearsal"));
    const res = await call(`/bands/${slug}/setlists/${setlist.id}`, "sam", {
      method: "PATCH",
      body: { title: "Rehearsal: the new ones" },
    });
    expect(res.status).toBe(200);
    expect((await setlistOf(res)).title).toBe("Rehearsal: the new ones");
    const taken = await call(`/bands/${slug}/setlists/${setlist.id}`, "sam", {
      method: "PATCH",
      body: { title: "bar gig" },
    });
    expect(await errorOf(taken)).toBe("setlist_title_taken");
    expect((await activityOf(db, setlist.id)).map((event) => event.action)).toEqual([
      "setlist.created",
      "setlist.renamed",
    ]);
  });

  test("archived setlists are listed apart, read-only, and restored", async () => {
    const setlist = await setlistOf(await create("max", "Summer festival"));
    const archived = await call(`/bands/${slug}/setlists/${setlist.id}/archive`, "sam", {
      method: "POST",
    });
    expect((await setlistOf(archived)).archivedAt).not.toBeNull();
    expect((await listOf("lea")).map((s) => s.id)).not.toContain(setlist.id);
    expect((await listOf("lea", true)).map((s) => s.id)).toContain(setlist.id);
    const rename = await call(`/bands/${slug}/setlists/${setlist.id}`, "sam", {
      method: "PATCH",
      body: { title: "Summer festival 2" },
    });
    expect(rename.status).toBe(409);
    expect(await errorOf(rename)).toBe("setlist_archived");
    const restored = await call(`/bands/${slug}/setlists/${setlist.id}/restore`, "sam", {
      method: "POST",
    });
    expect((await setlistOf(restored)).archivedAt).toBeNull();
    expect((await activityOf(db, setlist.id)).map((event) => event.action)).toEqual([
      "setlist.created",
      "setlist.archived",
      "setlist.restored",
    ]);
  });

  test("the band leader and the author delete a setlist; other musicians can't", async () => {
    const byMax = await setlistOf(await create("max", "To delete"));
    const forbidden = await call(`/bands/${slug}/setlists/${byMax.id}`, "sam", {
      method: "DELETE",
    });
    expect(forbidden.status).toBe(403);
    expect(
      (await call(`/bands/${slug}/setlists/${byMax.id}`, "max", { method: "DELETE" })).status,
    ).toBe(204);
    expect((await call(`/bands/${slug}/setlists/${byMax.id}`, "max")).status).toBe(404);

    const bySam = await setlistOf(await create("sam", "Leader deletes"));
    expect(
      (await call(`/bands/${slug}/setlists/${bySam.id}`, "lea", { method: "DELETE" })).status,
    ).toBe(204);
    expect((await activityOf(db, bySam.id)).map((event) => event.action)).toEqual([
      "setlist.created",
      "setlist.deleted",
    ]);
  });

  test("the journal names the setlist by its current title", async () => {
    const setlist = await setlistOf(await create("lea", "Journal set"));
    const res = await call(`/bands/${slug}/activity`, "max");
    const { entries } = (await res.json()) as {
      entries: { action: string; setlist?: string | null; target: unknown }[];
    };
    expect(entries.find((entry) => entry.action === "setlist.created")).toMatchObject({
      setlist: setlist.title,
      target: { type: "setlist", id: setlist.id },
    });
  });

  test(`a band has at most ${SETLIST_LIMITS.perBand} current setlists; archived ones don't count`, async () => {
    const current = await listOf("lea");
    const missing = SETLIST_LIMITS.perBand - current.length;
    await db
      .insert(setlists)
      .values(Array.from({ length: missing }, (_, i) => ({ bandId, title: `Filler ${i}` })));
    const over = await create("lea", "One too many");
    expect(over.status).toBe(409);
    expect(await errorOf(over)).toBe("too_many_setlists");

    // An archived one can't come back while the band is full, and archiving makes room.
    const archived = (await listOf("lea", true))[0];
    if (archived) {
      const restore = await call(`/bands/${slug}/setlists/${archived.id}/restore`, "lea", {
        method: "POST",
      });
      expect(await errorOf(restore)).toBe("too_many_setlists");
    }
    const first = (await listOf("lea"))[0];
    await call(`/bands/${slug}/setlists/${first?.id}/archive`, "lea", { method: "POST" });
    expect((await create("lea", "One too many")).status).toBe(201);
  });
});

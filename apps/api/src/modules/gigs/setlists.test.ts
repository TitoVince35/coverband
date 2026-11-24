import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { testBand } from "../../test-band";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Gig = {
  id: string;
  date: string;
  title: string | null;
  version: number;
  setlistId: string | null;
  venue: { id: string; name: string; city: string } | null;
};
type Setlist = {
  id: string;
  title: string;
  archivedAt: string | null;
  gigId: string | null;
  parts: { name: string | null; songs: { id: string }[] }[];
};

describe.skipIf(!databaseUrl)("each gig its own setlist, named after it (#358)", () => {
  const t = testBand("gig-setlists", databaseUrl);
  const { call, slug } = t;
  const today = localDateTime(new Date(), "Europe/Paris").date;
  const date = addDays(today, 30);

  const json = async <T>(res: Response) => (await res.json()) as T;
  const gigOf = async (res: Response) => (await json<{ gig: Gig }>(res)).gig;
  const setlistOf = async (id: string) =>
    (await json<{ setlist: Setlist }>(await call(`/bands/${slug}/setlists/${id}`, "max"))).setlist;
  const create = (body: Record<string, unknown>) =>
    call(`/bands/${slug}/gigs`, "max", { method: "POST", body: { date, ...body } });
  const edit = (gig: Gig, changes: Record<string, unknown>) =>
    call(`/bands/${slug}/gigs/${gig.id}`, "max", {
      method: "PATCH",
      body: { ...gig, venue: gig.venue, setlist: null, ...changes },
    });

  /** A setlist of the band with one song, the template. */
  async function template(title: string) {
    const song = await json<{ song: { id: string } }>(
      await call(`/bands/${slug}/songs`, "lea", {
        method: "POST",
        body: { title: `${title} song`, artist: "Someone" },
      }),
    );
    const { setlist } = await json<{ setlist: { id: string; version: number } }>(
      await call(`/bands/${slug}/setlists`, "lea", { method: "POST", body: { title } }),
    );
    await call(`/bands/${slug}/setlists/${setlist.id}/content`, "lea", {
      method: "PUT",
      body: {
        version: setlist.version,
        parts: [
          { name: "Set 1", songs: [song.song.id] },
          { name: "Encore", songs: [] },
        ],
      },
    });
    return setlist.id;
  }

  beforeAll(() => t.setUp({ lea: "leader", max: "musician" }));
  afterAll(() => t.cleanUp());

  test("a template picked: a copy, named after the gig, linked to it; the template unchanged", async () => {
    const from = await template("Summer set");
    const gig = await gigOf(await create({ title: "Rock night", setlist: { from } }));
    expect(gig.setlistId).not.toBe(from);
    const copy = await setlistOf(gig.setlistId ?? "");
    expect(copy).toMatchObject({ title: `Rock night · ${date}`, gigId: gig.id });
    expect(copy.parts.map((part) => [part.name, part.songs.length])).toEqual([
      ["Set 1", 1],
      ["Encore", 0],
    ]);
    expect(await setlistOf(from)).toMatchObject({ title: "Summer set", gigId: null });
  });

  test("a new one: one empty part, named after the venue without a title", async () => {
    const gig = await gigOf(
      await create({ venue: { name: "Le Bar'Hic", city: "Rennes" }, setlist: { from: null } }),
    );
    const setlist = await setlistOf(gig.setlistId ?? "");
    expect(setlist.title).toBe(`Le Bar'Hic · ${date}`);
    expect(setlist.parts).toEqual([{ name: null, songs: [] } as never]);
  });

  test("a name taken (same name, same day) is numbered", async () => {
    const first = await gigOf(await create({ title: "Twin", setlist: { from: null } }));
    const second = await gigOf(await create({ title: "Twin", setlist: { from: null } }));
    expect((await setlistOf(first.setlistId ?? "")).title).toBe(`Twin · ${date}`);
    expect((await setlistOf(second.setlistId ?? "")).title).toBe(`Twin · ${date} 2`);
  });

  test("renamed when the gig's title or date changes; never replaced", async () => {
    let gig = await gigOf(await create({ title: "Before", setlist: { from: null } }));
    const setlistId = gig.setlistId ?? "";
    const later = addDays(date, 1);
    gig = await gigOf(await edit(gig, { title: "After", date: later }));
    expect(gig.setlistId).toBe(setlistId);
    expect((await setlistOf(setlistId)).title).toBe(`After · ${later}`);
    // Saved without a change: the title stays.
    gig = await gigOf(await edit(gig, {}));
    expect((await setlistOf(setlistId)).title).toBe(`After · ${later}`);
    // Another setlist for it: refused.
    const res = await edit(gig, { setlist: { from: null } });
    expect(res.status).toBe(409);
    expect(await json<{ error: { code: string } }>(res)).toMatchObject({
      error: { code: "gig_setlist_linked" },
    });
  });

  test("a setlist made when an existing gig is edited", async () => {
    let gig = await gigOf(await create({ title: "Later set" }));
    expect(gig.setlistId).toBeNull();
    gig = await gigOf(await edit(gig, { setlist: { from: null } }));
    expect((await setlistOf(gig.setlistId ?? "")).title).toBe(`Later set · ${date}`);
  });

  test("renamed when its venue is renamed, for the gigs there without a title", async () => {
    const gig = await gigOf(
      await create({ venue: { name: "Old Pub", city: "Brest" }, setlist: { from: null } }),
    );
    const titled = await gigOf(
      await create({
        title: "Titled",
        venue: { id: gig.venue?.id, name: "Old Pub", city: "Brest" },
        setlist: { from: null },
      }),
    );
    const res = await call(`/bands/${slug}/venues/${gig.venue?.id}`, "max", {
      method: "PATCH",
      body: { name: "New Pub", city: "Brest" },
    });
    expect(res.status).toBe(200);
    expect((await setlistOf(gig.setlistId ?? "")).title).toBe(`New Pub · ${date}`);
    expect((await setlistOf(titled.setlistId ?? "")).title).toBe(`Titled · ${date}`);
  });

  test("its title can't be renamed by hand; listed with its gig", async () => {
    const gig = await gigOf(await create({ title: "Locked", setlist: { from: null } }));
    const res = await call(`/bands/${slug}/setlists/${gig.setlistId}`, "max", {
      method: "PATCH",
      body: { title: "Something else" },
    });
    expect(res.status).toBe(409);
    expect(await json<{ error: { code: string } }>(res)).toMatchObject({
      error: { code: "setlist_named_by_gig" },
    });
    const { setlists } = await json<{ setlists: Setlist[] }>(
      await call(`/bands/${slug}/setlists`, "max"),
    );
    expect(setlists.find((setlist) => setlist.id === gig.setlistId)?.gigId).toBe(gig.id);
  });

  test("a deleted gig leaves its setlist archived", async () => {
    const gig = await gigOf(await create({ title: "Gone", setlist: { from: null } }));
    const res = await call(`/bands/${slug}/gigs/${gig.id}`, "max", { method: "DELETE" });
    expect(res.status).toBe(204);
    const setlist = await setlistOf(gig.setlistId ?? "");
    expect(setlist.archivedAt).not.toBeNull();
    expect(setlist.gigId).toBeNull();
  });
});

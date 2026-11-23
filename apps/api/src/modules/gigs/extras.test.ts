import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { testBand } from "../../test-band";
import { activityOf } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Gig = {
  id: string;
  date: string;
  title: string | null;
  version: number;
  setlistId: string | null;
  getInTime: string | null;
  programLinks: { url: string; title: string | null }[];
  programNotes: string | null;
  payCents: number | null;
  payNotes: string | null;
  sharedBackline: boolean;
  backlineNotes: string | null;
  techniciansProvided: boolean;
  notes: string | null;
};

describe.skipIf(!databaseUrl)("a gig's setlist, program and extra info (#328)", () => {
  const t = testBand("gig-extras", databaseUrl);
  const { call, slug, otherSlug } = t;
  const date = addDays(localDateTime(new Date(), "Europe/Paris").date, 20);

  const setlist = async (who: string, title: string, band = slug) => {
    const res = await call(`/bands/${band}/setlists`, who, { method: "POST", body: { title } });
    return ((await res.json()) as { setlist: { id: string } }).setlist.id;
  };
  const create = (body: Record<string, unknown>) =>
    call(`/bands/${slug}/gigs`, "max", { method: "POST", body: { date, title: "Bar", ...body } });
  const gigOf = async (res: Response) => ((await res.json()) as { gig: Gig }).gig;
  const edit = (gig: Gig, changes: Record<string, unknown>) =>
    call(`/bands/${slug}/gigs/${gig.id}`, "max", {
      method: "PATCH",
      body: { ...gig, venue: null, ...changes },
    });

  beforeAll(() => t.setUp({ lea: "leader", max: "musician" }));
  afterAll(() => t.cleanUp());

  test("a gig keeps its setlist, program and extra info", async () => {
    const setlistId = await setlist("lea", "One set");
    const res = await create({
      setlistId,
      getInTime: "18:30",
      programLinks: [{ url: "https://example.com/event", title: "Facebook event" }],
      programNotes: "Two sets, break at 22:00",
      payCents: 40000,
      payNotes: "cash on the night",
      sharedBackline: true,
      backlineNotes: "drums, bass amp",
      techniciansProvided: true,
      notes: "Parking behind the bar",
    });
    expect(res.status).toBe(201);
    expect(await gigOf(res)).toMatchObject({
      setlistId,
      getInTime: "18:30",
      programLinks: [{ url: "https://example.com/event", title: "Facebook event" }],
      programNotes: "Two sets, break at 22:00",
      payCents: 40000,
      payNotes: "cash on the night",
      sharedBackline: true,
      backlineNotes: "drums, bass amp",
      techniciansProvided: true,
      notes: "Parking behind the bar",
    });
  });

  test("another band's setlist, or an archived one, is refused when chosen", async () => {
    const theirs = await setlist("zoe", "Theirs", otherSlug);
    expect((await create({ setlistId: theirs })).status).toBe(400);
    const archived = await setlist("lea", "Old set");
    await call(`/bands/${slug}/setlists/${archived}/archive`, "lea", { method: "POST" });
    expect((await create({ setlistId: archived })).status).toBe(400);
  });

  test("an archived setlist stays linked; a deleted one leaves the gig without one", async () => {
    const setlistId = await setlist("lea", "Wedding set");
    let gig = await gigOf(await create({ setlistId }));
    await call(`/bands/${slug}/setlists/${setlistId}/archive`, "lea", { method: "POST" });
    // Saved again with the archived setlist still linked: allowed.
    const res = await edit(gig, { notes: "Still the wedding set" });
    expect(res.status).toBe(200);
    gig = await gigOf(res);
    expect(gig.setlistId).toBe(setlistId);
    await call(`/bands/${slug}/setlists/${setlistId}`, "lea", { method: "DELETE" });
    gig = await gigOf(await call(`/bands/${slug}/gigs/${gig.id}`, "max"));
    expect(gig.setlistId).toBeNull();
  });

  test("a program link added and the program changed are their own events", async () => {
    const gig = await gigOf(await create({}));
    const res = await edit(gig, {
      programLinks: [{ url: "https://example.com/poster", title: null }],
      programNotes: "Release party",
      getInTime: "19:00",
    });
    expect(res.status).toBe(200);
    const events = await activityOf(t.db, gig.id);
    expect(events.map((event) => [event.action, event.data])).toEqual([
      ["gig.created", null],
      ["gig.program_link_added", { count: 1 }],
      ["gig.program_updated", null],
      ["gig.updated", { fields: "getInTime" }],
    ]);
  });

  test("the pay is whole cents, within its limit", async () => {
    expect((await create({ payCents: 12.5 })).status).toBe(400);
    expect((await create({ payCents: -1 })).status).toBe(400);
  });
});

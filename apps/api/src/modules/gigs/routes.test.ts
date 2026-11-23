import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { testBand } from "../../test-band";
import { activityOf } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Venue = { id: string; name: string; city: string; address: string | null; gigs: number };
type Gig = {
  id: string;
  date: string;
  title: string | null;
  status: string;
  version: number;
  createdBy: string | null;
  venue: Venue | null;
};

describe.skipIf(!databaseUrl)("a band's gigs and venues", () => {
  const t = testBand("gigs", databaseUrl);
  const { call, ids, slug, otherSlug, band, errorOf } = t;
  const today = localDateTime(new Date(), "Europe/Paris").date;
  const inDays = (days: number) => addDays(today, days);
  const newVenue = { name: "Le Mondo Bizarro", city: "Rennes", address: "264 av. Patton" };

  const create = (who: string, body: unknown, bandSlug = slug) =>
    call(`/bands/${bandSlug}/gigs`, who, { method: "POST", body });
  const gigOf = async (res: Response) => ((await res.json()) as { gig: Gig }).gig;
  const listOf = async (who: string, when = "next") =>
    (
      (await (await call(`/bands/${slug}/gigs?when=${when}&tz=Europe/Paris`, who)).json()) as {
        gigs: Gig[];
      }
    ).gigs;

  beforeAll(() => t.setUp({ lea: "leader", max: "musician" }));
  afterAll(() => t.cleanUp());

  test("a member creates a gig with a new venue: proposed, with its author", async () => {
    const res = await create("max", { date: inDays(10), title: null, venue: newVenue });
    expect(res.status).toBe(201);
    const gig = await gigOf(res);
    expect(gig).toMatchObject({
      date: inDays(10),
      title: null,
      status: "proposed",
      createdBy: "max name",
      venue: { name: "Le Mondo Bizarro", city: "Rennes", address: "264 av. Patton" },
    });
    expect((await activityOf(t.db, gig.id)).map((e) => e.action)).toEqual(["gig.created"]);
    expect((await activityOf(t.db, gig.venue?.id ?? "")).map((e) => e.action)).toEqual([
      "venue.created",
    ]);
  });

  test("a date and a title or a venue are required", async () => {
    expect((await create("max", { date: inDays(3) })).status).toBe(400);
    expect((await create("max", { title: "No date" })).status).toBe(400);
    expect((await create("max", { date: "2026-02-30", title: "Bad date" })).status).toBe(400);
    expect((await create("max", { date: inDays(3), title: "Title only" })).status).toBe(201);
  });

  test("a venue's name and city are unique within the band, case ignored", async () => {
    const again = await create("lea", {
      date: inDays(20),
      venue: { name: "LE MONDO BIZARRO", city: "rennes" },
    });
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe("venue_taken");
    // Another city, or another band: free.
    expect(
      (
        await create("lea", {
          date: inDays(20),
          venue: { name: "Le Mondo Bizarro", city: "Brest" },
        })
      ).status,
    ).toBe(201);
    expect((await create("zoe", { date: inDays(20), venue: newVenue }, otherSlug)).status).toBe(
      201,
    );
  });

  test("a gig at the band's venue; its changed details show on every gig there", async () => {
    const venues = (
      (await (await call(`/bands/${slug}/venues?q=mondo`, "lea")).json()) as { venues: Venue[] }
    ).venues;
    const mondo = venues.find((venue) => venue.city === "Rennes");
    expect(mondo?.gigs).toBe(1);
    const res = await create("lea", {
      date: inDays(30),
      title: "Second night",
      venue: { ...newVenue, id: mondo?.id, address: "264 avenue du Général Patton" },
    });
    expect(res.status).toBe(201);
    const gigs = (await listOf("max")).filter((gig) => gig.venue?.id === mondo?.id);
    expect(gigs).toHaveLength(2);
    expect(gigs.map((gig) => gig.venue?.address)).toEqual([
      "264 avenue du Général Patton",
      "264 avenue du Général Patton",
    ]);
  });

  test("another band's venue is refused", async () => {
    const theirs = (
      (await (await call(`/bands/${otherSlug}/venues`, "zoe")).json()) as { venues: Venue[] }
    ).venues[0];
    const res = await create("lea", { date: inDays(5), venue: { ...newVenue, id: theirs?.id } });
    expect(res.status).toBe(400);
  });

  test("next, past and all, by a gig's day", async () => {
    const past = await gigOf(await create("max", { date: inDays(-3), title: "Last week" }));
    const next = await listOf("max");
    expect(next.map((gig) => gig.id)).not.toContain(past.id);
    expect(next.map((gig) => gig.date)).toEqual([...next.map((gig) => gig.date)].sort());
    expect((await listOf("max", "past")).map((gig) => gig.id)).toEqual([past.id]);
    expect((await listOf("max", "all"))[0]?.id).toBe(past.id);
  });

  test("a member edits a gig read at its version; an older version is refused", async () => {
    const gig = await gigOf(await create("max", { date: inDays(40), title: "Draft" }));
    const edit = (version: number, title: string) =>
      call(`/bands/${slug}/gigs/${gig.id}`, "lea", {
        method: "PATCH",
        body: { version, date: inDays(41), title, type: "private", showTime: "21:30" },
      });
    const res = await edit(gig.version, "Wedding");
    expect(res.status).toBe(200);
    expect(await gigOf(res)).toMatchObject({
      title: "Wedding",
      date: inDays(41),
      version: gig.version + 1,
    });
    const stale = await edit(gig.version, "Too late");
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toBe("gig_outdated");
    const events = await activityOf(t.db, gig.id);
    expect(events.at(-1)).toMatchObject({
      action: "gig.updated",
      actorId: ids.lea ?? "",
      bandId: band.id,
      data: { fields: "date,title,type,showTime" },
    });
  });

  test("a venue's details change from its own route", async () => {
    const [venue] = (
      (await (await call(`/bands/${slug}/venues`, "max")).json()) as { venues: Venue[] }
    ).venues;
    const res = await call(`/bands/${slug}/venues/${venue?.id}`, "max", {
      method: "PATCH",
      body: { name: venue?.name, city: venue?.city, description: "Rock club, 300 people" },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { venue: { description: string } }).venue.description).toBe(
      "Rock club, 300 people",
    );
  });

  test("non-members get a 404, for gigs and venues alike", async () => {
    const gig = (await listOf("lea"))[0];
    expect((await call(`/bands/${slug}/gigs`, "zoe")).status).toBe(404);
    expect((await call(`/bands/${slug}/venues`, "zoe")).status).toBe(404);
    expect((await call(`/bands/${otherSlug}/gigs/${gig?.id}`, "zoe")).status).toBe(404);
  });
});

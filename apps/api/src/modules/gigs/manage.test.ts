import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { testBand } from "../../test-band";
import { activityOf } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Contact = { id: string; name: string; phone: string | null; email: string | null };
type Venue = { id: string; name: string; city: string; contacts: Contact[] };
type Gig = { id: string; contacts: Contact[]; venue: Venue | null };

describe.skipIf(!databaseUrl)("the band's venues and contacts pages (#334)", () => {
  const t = testBand("gig-manage", databaseUrl);
  const { call, slug, otherSlug, errorOf } = t;
  const date = addDays(localDateTime(new Date(), "Europe/Paris").date, 30);

  const json = async <T>(res: Response) => (await res.json()) as T;
  const addContact = async (body: Record<string, unknown>, band = slug, who = "max") =>
    (
      await json<{ contact: Contact }>(
        await call(`/bands/${band}/contacts`, who, { method: "POST", body }),
      )
    ).contact;
  const createGig = async (body: Record<string, unknown>) =>
    (
      await json<{ gig: Gig }>(
        await call(`/bands/${slug}/gigs`, "max", { method: "POST", body: { date, ...body } }),
      )
    ).gig;
  const readGig = async (id: string) =>
    (await json<{ gig: Gig }>(await call(`/bands/${slug}/gigs/${id}`, "max"))).gig;

  beforeAll(() => t.setUp({ lea: "leader", max: "musician" }));
  afterAll(() => t.cleanUp());

  test("a venue from its page, with its gigs; deleted only when no gig uses it", async () => {
    const res = await call(`/bands/${slug}/venues`, "max", {
      method: "POST",
      body: { name: "La Péniche", city: "Rennes" },
    });
    expect(res.status).toBe(201);
    const { venue } = await json<{ venue: Venue }>(res);
    const gig = await createGig({
      title: "On the boat",
      venue: { ...venue, contactIds: undefined },
    });
    const read = await json<{ venue: Venue & { gigList: { id: string }[] } }>(
      await call(`/bands/${slug}/venues/${venue.id}`, "max"),
    );
    expect(read.venue.gigList.map((g) => g.id)).toEqual([gig.id]);
    const refused = await call(`/bands/${slug}/venues/${venue.id}`, "max", { method: "DELETE" });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe("venue_in_use");
    await call(`/bands/${slug}/gigs/${gig.id}`, "max", { method: "DELETE" });
    expect(
      (await call(`/bands/${slug}/venues/${venue.id}`, "max", { method: "DELETE" })).status,
    ).toBe(204);
    expect((await activityOf(t.db, venue.id)).map((e) => e.action)).toEqual([
      "venue.created",
      "venue.deleted",
    ]);
  });

  test("deleting a contact removes it from every gig and venue", async () => {
    const claire = await addContact({ name: "Claire", type: "organizer", phone: "07 11 22 33 44" });
    const gig = await createGig({
      title: "Wedding",
      venue: { name: "Manoir", city: "Vannes", contactIds: [claire.id] },
      contactIds: [claire.id],
    });
    const res = await call(`/bands/${slug}/contacts/${claire.id}`, "lea", { method: "DELETE" });
    expect(res.status).toBe(204);
    const after = await readGig(gig.id);
    expect(after.contacts).toEqual([]);
    expect(after.venue?.contacts).toEqual([]);
    expect((await call(`/bands/${slug}/contacts/${claire.id}`, "max")).status).toBe(404);
  });

  test("merging two contacts keeps one set of details, everywhere the other was", async () => {
    const yann = await addContact({ name: "Yann", type: "organizer", email: "yann@example.com" });
    const twin = await addContact({ name: "Yann Le Goff", type: "organizer", phone: "06 12" });
    const both = await createGig({ title: "Both", contactIds: [yann.id, twin.id] });
    const onlyTwin = await createGig({
      title: "Twin",
      venue: { name: "Le Ty Anna", city: "Rennes", contactIds: [twin.id] },
    });
    const res = await call(`/bands/${slug}/contacts/${yann.id}/merge`, "max", {
      method: "POST",
      body: {
        from: twin.id,
        details: {
          name: "Yann Le Goff",
          type: "organizer",
          phone: "06 12",
          email: "yann@example.com",
        },
      },
    });
    expect(res.status).toBe(200);
    const { contact } = await json<{ contact: Contact & { gigs: number; venues: unknown[] } }>(res);
    expect(contact).toMatchObject({ name: "Yann Le Goff", phone: "06 12", gigs: 1 });
    expect(contact.venues).toHaveLength(1);
    expect((await readGig(both.id)).contacts.map((c) => c.id)).toEqual([yann.id]);
    expect((await readGig(onlyTwin.id)).venue?.contacts.map((c) => c.id)).toEqual([yann.id]);
    expect((await call(`/bands/${slug}/contacts/${twin.id}`, "max")).status).toBe(404);
    expect((await activityOf(t.db, yann.id)).at(-1)).toMatchObject({
      action: "band_contact.merged",
      data: { from: twin.id },
    });
  });

  test("band isolation: another band's contact can't be merged or deleted", async () => {
    const mine = await addContact({ name: "Mine", type: "musician" });
    const theirs = await addContact({ name: "Theirs", type: "musician" }, otherSlug, "zoe");
    const merge = await call(`/bands/${slug}/contacts/${mine.id}/merge`, "max", {
      method: "POST",
      body: { from: theirs.id, details: { name: "Mine", type: "musician" } },
    });
    expect(merge.status).toBe(404);
    expect(
      (await call(`/bands/${slug}/contacts/${theirs.id}`, "max", { method: "DELETE" })).status,
    ).toBe(404);
    expect((await call(`/bands/${slug}/venues`, "zoe")).status).toBe(404);
  });
});

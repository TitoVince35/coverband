import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { testBand } from "../../test-band";
import { activityOf } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Contact = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
};
type Gig = {
  id: string;
  version: number;
  contacts: Contact[];
  venue: { id: string; name: string; city: string; contacts: Contact[] } | null;
};

describe.skipIf(!databaseUrl)("a band's contacts, on its gigs and venues (#329)", () => {
  const t = testBand("gig-contacts", databaseUrl);
  const { call, slug, otherSlug } = t;
  const date = addDays(localDateTime(new Date(), "Europe/Paris").date, 15);

  const addContact = async (who: string, body: Record<string, unknown>, band = slug) => {
    const res = await call(`/bands/${band}/contacts`, who, { method: "POST", body });
    expect(res.status).toBe(201);
    return ((await res.json()) as { contact: Contact }).contact;
  };
  const gigOf = async (res: Response) => ((await res.json()) as { gig: Gig }).gig;
  const createGig = (body: Record<string, unknown>) =>
    call(`/bands/${slug}/gigs`, "max", { method: "POST", body: { date, ...body } });

  beforeAll(() => t.setUp({ lea: "leader", max: "musician" }));
  afterAll(() => t.cleanUp());

  test("a contact: name and type required, email checked", async () => {
    const bad = (body: unknown) => call(`/bands/${slug}/contacts`, "max", { method: "POST", body });
    expect((await bad({ name: "Yann" })).status).toBe(400);
    expect((await bad({ type: "organizer" })).status).toBe(400);
    expect((await bad({ name: "Yann", type: "organizer", email: "nope" })).status).toBe(400);
    const yann = await addContact("max", {
      name: "Yann",
      type: "organizer",
      phone: "06 12 34 56 78",
      email: "yann@example.com",
    });
    expect(yann).toMatchObject({ name: "Yann", type: "organizer", phone: "06 12 34 56 78" });
    expect((await activityOf(t.db, yann.id)).map((e) => e.action)).toEqual([
      "band_contact.created",
    ]);
  });

  test("a venue's contacts show on every gig there, before the gig's own", async () => {
    const nico = await addContact("max", { name: "Nico", type: "technical" });
    const sound = await addContact("max", { name: "Sound desk", type: "technical" });
    const first = await gigOf(
      await createGig({
        venue: { name: "Le Mondo", city: "Rennes", contactIds: [nico.id] },
        contactIds: [sound.id],
      }),
    );
    expect(first.venue?.contacts.map((c) => c.name)).toEqual(["Nico"]);
    expect(first.contacts.map((c) => c.name)).toEqual(["Sound desk"]);
    expect((await activityOf(t.db, first.id)).map((e) => e.action)).toContain("gig.contact_added");
    // The next gig at the venue lists its contacts too: linked, not copied.
    const second = await gigOf(
      await createGig({ title: "Again", venue: { ...first.venue, contactIds: undefined } }),
    );
    expect(second.venue?.contacts.map((c) => c.name)).toEqual(["Nico"]);
    expect(second.contacts).toEqual([]);
    // A changed phone number changes everywhere.
    await call(`/bands/${slug}/contacts/${nico.id}`, "lea", {
      method: "PATCH",
      body: { name: "Nico", type: "technical", phone: "06 98 76 54 32" },
    });
    const again = await gigOf(await call(`/bands/${slug}/gigs/${first.id}`, "max"));
    expect(again.venue?.contacts[0]?.phone).toBe("06 98 76 54 32");
    // Where it's used: the venue, and the gigs.
    const listed = (
      (await (await call(`/bands/${slug}/contacts?q=nico`, "max")).json()) as {
        contacts: (Contact & { venues: { name: string }[]; gigs: number })[];
      }
    ).contacts;
    expect(listed).toEqual([
      expect.objectContaining({
        name: "Nico",
        venues: [expect.objectContaining({ name: "Le Mondo" })],
        gigs: 0,
      }),
    ]);
  });

  test("a contact reused on another gig, and removed from one", async () => {
    const yann = (
      (await (await call(`/bands/${slug}/contacts?q=yann`, "max")).json()) as {
        contacts: Contact[];
      }
    ).contacts[0];
    let gig = await gigOf(await createGig({ title: "One", contactIds: [yann?.id] }));
    const other = await gigOf(await createGig({ title: "Two", contactIds: [yann?.id] }));
    expect(other.contacts.map((c) => c.id)).toEqual([yann?.id ?? ""]);
    const res = await call(`/bands/${slug}/gigs/${gig.id}`, "max", {
      method: "PATCH",
      body: { version: gig.version, date, title: "One", contactIds: [] },
    });
    gig = await gigOf(res);
    expect(gig.contacts).toEqual([]);
    // Saving without contactIds leaves them as they are.
    const kept = await gigOf(
      await call(`/bands/${slug}/gigs/${other.id}`, "max", {
        method: "PATCH",
        body: { version: other.version, date, title: "Two, renamed" },
      }),
    );
    expect(kept.contacts.map((c) => c.id)).toEqual([yann?.id ?? ""]);
  });

  test("band isolation: another band's contacts are refused and hidden", async () => {
    const theirs = await addContact("zoe", { name: "Theirs", type: "musician" }, otherSlug);
    expect((await createGig({ title: "X", contactIds: [theirs.id] })).status).toBe(400);
    expect((await call(`/bands/${slug}/contacts/${theirs.id}`, "max")).status).toBe(404);
    expect((await call(`/bands/${slug}/contacts`, "zoe")).status).toBe(404);
  });
});

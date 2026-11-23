import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, localDateTime } from "@coverband/shared";
import { createMemoryGeocoder } from "../../adapters/geocoder";
import { testBand } from "../../test-band";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Venue = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};
type Gig = { id: string; version: number; date: string; title: string | null; venue: Venue | null };

describe.skipIf(!databaseUrl)("the venue on a map (#333)", () => {
  const geocoding = createMemoryGeocoder({
    "19 place Sainte-Anne, Rennes": { latitude: 48.1137, longitude: -1.6801 },
    "Quai Saint-Cyr, Rennes": { latitude: 48.1066, longitude: -1.6944 },
  });
  const t = testBand("gig-map", databaseUrl, { geocoder: geocoding.geocoder });
  const { call, slug } = t;
  const date = addDays(localDateTime(new Date(), "Europe/Paris").date, 12);

  const gigOf = async (res: Response) => ((await res.json()) as { gig: Gig }).gig;
  const create = async (venue: Record<string, unknown>) =>
    gigOf(await call(`/bands/${slug}/gigs`, "max", { method: "POST", body: { date, venue } }));
  const saveVenue = async (venue: Venue, changes: Record<string, unknown>) => {
    const res = await call(`/bands/${slug}/venues/${venue.id}`, "max", {
      method: "PATCH",
      body: { name: venue.name, city: venue.city, address: venue.address, ...changes },
    });
    return ((await res.json()) as { venue: Venue }).venue;
  };

  beforeAll(() => t.setUp({ max: "musician" }));
  afterAll(() => t.cleanUp());

  test("found from its address, once per address saved", async () => {
    const gig = await create({
      name: "Le Ty Anna",
      city: "Rennes",
      address: "19 place Sainte-Anne",
    });
    expect(gig.venue).toMatchObject({ latitude: 48.1137, longitude: -1.6801 });
    expect(geocoding.queries).toEqual(["19 place Sainte-Anne, Rennes"]);
    // Saved again with the same address: not asked again.
    const again = await saveVenue(gig.venue as Venue, { description: "Small bar" });
    expect(again.latitude).toBe(48.1137);
    expect(geocoding.queries).toHaveLength(1);
  });

  test("an address not found, or none: no map", async () => {
    const lost = await create({ name: "Lost", city: "Rennes", address: "Nowhere street" });
    expect(lost.venue).toMatchObject({ latitude: null, longitude: null });
    const none = await create({ name: "No address", city: "Rennes" });
    expect(none.venue).toMatchObject({ latitude: null, longitude: null });
    expect(geocoding.queries).not.toContain("No address, Rennes");
  });

  test("a changed address is looked up again; a dragged pin is kept", async () => {
    const gig = await create({ name: "La Péniche", city: "Rennes", address: "Nowhere quay" });
    let venue = await saveVenue(gig.venue as Venue, { address: "Quai Saint-Cyr" });
    expect(venue).toMatchObject({ latitude: 48.1066, longitude: -1.6944 });
    venue = await saveVenue(venue, { coordinates: { latitude: 48.107, longitude: -1.695 } });
    expect(venue).toMatchObject({ latitude: 48.107, longitude: -1.695 });
    const asked = geocoding.queries.length;
    venue = await saveVenue(venue, { description: "On the Vilaine" });
    expect(venue).toMatchObject({ latitude: 48.107, longitude: -1.695 });
    expect(geocoding.queries).toHaveLength(asked);
  });

  test("Nominatim out of reach: no map, logged, asked again at the next save", async () => {
    geocoding.state.failing = true;
    const gig = await create({ name: "Le Mondo", city: "Rennes", address: "19 place Sainte-Anne" });
    expect(gig.venue).toMatchObject({ latitude: null });
    geocoding.state.failing = false;
    const venue = await saveVenue(gig.venue as Venue, {});
    expect(venue).toMatchObject({ latitude: 48.1137 });
  });
});

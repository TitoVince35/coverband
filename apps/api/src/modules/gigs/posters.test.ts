import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addDays, GIG_POSTER_LIMITS, localDateTime } from "@coverband/shared";
import { createMemoryStorage } from "../../adapters/storage";
import { testBand } from "../../test-band";
import { activityOf } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Poster = { id: string; title: string; size: number };
type Gig = { id: string; posters: Poster[] };

/** The first bytes of a JPEG, then filler: enough for the type check. */
const jpeg = (size = 1000) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

describe.skipIf(!databaseUrl)("a gig's posters (#330)", () => {
  const storage = createMemoryStorage();
  const t = testBand("gig-posters", databaseUrl, { storage });
  const { call, slug, otherSlug, errorOf } = t;
  const date = addDays(localDateTime(new Date(), "Europe/Paris").date, 25);
  const tz = "?tz=Europe/Paris";

  const createGig = async (who = "max") => {
    const res = await call(`/bands/${slug}/gigs`, who, {
      method: "POST",
      body: { date, title: "Poster night" },
    });
    return ((await res.json()) as { gig: Gig }).gig;
  };
  const upload = (who: string, gig: Gig, bytes: Uint8Array, title = "Flyer", band = slug) => {
    const form = new FormData();
    form.set("file", new File([bytes], "flyer.jpg", { type: "image/jpeg" }));
    form.set("title", title);
    return call(`/bands/${band}/gigs/${gig.id}/posters${tz}`, who, { method: "POST", body: form });
  };
  const posterOf = async (res: Response) => ((await res.json()) as { poster: Poster }).poster;

  beforeAll(() => t.setUp({ lea: "leader", max: "musician", sam: "musician" }));
  afterAll(() => t.cleanUp());

  test("a member adds a poster, listed with the gig, its file served to members only", async () => {
    const gig = await createGig();
    const res = await upload("sam", gig, jpeg());
    expect(res.status).toBe(201);
    const poster = await posterOf(res);
    expect(poster).toMatchObject({ title: "Flyer", size: 1000 });
    const read = (await (await call(`/bands/${slug}/gigs/${gig.id}`, "max")).json()) as {
      gig: Gig;
    };
    expect(read.gig.posters.map((p) => p.id)).toEqual([poster.id]);
    const file = await call(`/bands/${slug}/gigs/${gig.id}/posters/${poster.id}/file`, "max");
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect((await file.arrayBuffer()).byteLength).toBe(1000);
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}/posters/${poster.id}/file`, "zoe")).status,
    ).toBe(404);
    expect((await activityOf(t.db, gig.id)).map((e) => e.action)).toContain("gig.poster_added");
  });

  test("limits: images only, 5 MB each, 5 per gig", async () => {
    const gig = await createGig();
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const notImage = await upload("max", gig, svg);
    expect(notImage.status).toBe(400);
    expect(await errorOf(notImage)).toBe("invalid_image");
    const big = await upload("max", gig, jpeg(GIG_POSTER_LIMITS.maxBytes + 1));
    expect(big.status).toBe(413);
    for (let i = 0; i < GIG_POSTER_LIMITS.perGig; i++) {
      expect((await upload("max", gig, jpeg(), `Poster ${i}`)).status).toBe(201);
    }
    const sixth = await upload("max", gig, jpeg());
    expect(sixth.status).toBe(409);
    expect(await errorOf(sixth)).toBe("too_many_posters");
  });

  test("who added it, or the band leader, removes it; its file goes", async () => {
    const gig = await createGig();
    const poster = await posterOf(await upload("max", gig, jpeg()));
    const remove = (who: string) =>
      call(`/bands/${slug}/gigs/${gig.id}/posters/${poster.id}${tz}`, who, { method: "DELETE" });
    expect((await remove("sam")).status).toBe(403);
    const files = storage.objects.size;
    expect((await remove("lea")).status).toBe(204);
    expect(storage.objects.size).toBe(files - 1);
  });

  test("another band's gig, or a cancelled one, takes none", async () => {
    const gig = await createGig();
    expect((await upload("zoe", gig, jpeg(), "Flyer", otherSlug)).status).toBe(404);
    await call(`/bands/${slug}/gigs/${gig.id}/cancel${tz}`, "max", {
      method: "POST",
      body: { reason: "Rain" },
    });
    const refused = await upload("max", gig, jpeg());
    expect(await errorOf(refused)).toBe("gig_cancelled");
  });

  test("deleting the gig deletes its posters' files", async () => {
    const gig = await createGig();
    await upload("max", gig, jpeg());
    await upload("max", gig, jpeg());
    const files = storage.objects.size;
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "max", { method: "DELETE" })).status,
    ).toBe(204);
    expect(storage.objects.size).toBe(files - 2);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { addDays, localDateTime } from "@coverband/shared";
import { eq } from "drizzle-orm";
import { createMemoryPushSender, PUSH_SERVICE_HOSTS, vapidKeys } from "../../adapters/push";
import { gigs, pushSubscriptions } from "../../core/db/schema";
import { testBand } from "../../test-band";
import { activityOf } from "../../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

type Gig = {
  id: string;
  date: string;
  title: string | null;
  status: string;
  version: number;
  cancelledReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  venue: { id: string; name: string; city: string } | null;
};

describe.skipIf(!databaseUrl)("a gig's life cycle (#327)", () => {
  const memoryPush = createMemoryPushSender();
  const pem = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const t = testBand("gig-life", databaseUrl, {
    push: {
      keys: vapidKeys(pem, "https://app.test"),
      serviceHosts: PUSH_SERVICE_HOSTS,
      sender: memoryPush.sender,
    },
  });
  const { call, ids, slug, errorOf } = t;
  const today = localDateTime(new Date(), "Europe/Paris").date;
  const inDays = (days: number) => addDays(today, days);
  const tz = "?tz=Europe/Paris";

  const create = async (who: string, body: Record<string, unknown>) => {
    const res = await call(`/bands/${slug}/gigs`, who, { method: "POST", body });
    expect(res.status).toBe(201);
    return ((await res.json()) as { gig: Gig }).gig;
  };
  const act = (who: string, gig: Gig, action: string, body?: unknown) =>
    call(`/bands/${slug}/gigs/${gig.id}/${action}${tz}`, who, { method: "POST", body });
  const edit = (who: string, gig: Gig, changes: Record<string, unknown>) =>
    call(`/bands/${slug}/gigs/${gig.id}${tz}`, who, {
      method: "PATCH",
      body: {
        version: gig.version,
        date: gig.date,
        title: gig.title,
        venue: gig.venue ? { ...gig.venue } : null,
        ...changes,
      },
    });
  const gigOf = async (res: Response) => ((await res.json()) as { gig: Gig }).gig;

  beforeAll(async () => {
    await t.setUp({ lea: "leader", max: "musician", sam: "musician" });
    // Lea and Sam get pushes, Lea in French.
    await t.db.insert(pushSubscriptions).values([
      {
        userId: ids.lea ?? "",
        endpoint: `https://fcm.googleapis.com/lea-${slug}`,
        p256dh: "k",
        auth: "a",
        language: "fr",
      },
      {
        userId: ids.sam ?? "",
        endpoint: `https://fcm.googleapis.com/sam-${slug}`,
        p256dh: "k",
        auth: "a",
        language: "en",
      },
    ]);
  });
  afterAll(() => t.cleanUp());

  test("its creator settles it; the others get a push in their language", async () => {
    const gig = await create("max", { date: "2027-12-18", title: "Wedding" });
    memoryPush.sent.length = 0;
    const res = await act("max", gig, "settle");
    expect(res.status).toBe(200);
    expect((await gigOf(res)).status).toBe("settled");
    const pushes = memoryPush.sent.map((push) => push.payload);
    expect(pushes).toContainEqual({
      title: `gig-life ${slug.split("-").at(-1)}`,
      body: "Concert confirmé : Wedding, sam. 18 déc.",
      url: `/b/${slug}/gigs/${gig.id}`,
    });
    expect(pushes).toContainEqual(
      expect.objectContaining({ body: "Gig settled: Wedding, Sat, Dec 18" }),
    );
    expect(pushes).toHaveLength(2);
    // Settling again changes nothing and pushes nothing.
    memoryPush.sent.length = 0;
    expect((await act("max", gig, "settle")).status).toBe(200);
    expect(memoryPush.sent).toHaveLength(0);
    expect((await activityOf(t.db, gig.id)).map((e) => e.action)).toEqual([
      "gig.created",
      "gig.settled",
    ]);
  });

  test("settle, postpone, cancel and delete: its creator or a band leader only", async () => {
    const gig = await create("max", { date: inDays(30), title: "Bar" });
    for (const action of ["settle", "postpone"]) {
      const res = await act("sam", gig, action);
      expect(res.status).toBe(403);
    }
    expect((await act("sam", gig, "cancel", { reason: "No" })).status).toBe(403);
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "sam", { method: "DELETE" })).status,
    ).toBe(403);
    // Any member edits the rest.
    expect((await edit("sam", gig, { showTime: "21:00" })).status).toBe(200);
    // The band leader may.
    expect((await act("lea", gig, "settle")).status).toBe(200);
  });

  test("settled: date, title and venue are fixed until postponed", async () => {
    let gig = await create("lea", { date: inDays(40), title: "Festival" });
    gig = await gigOf(await act("lea", gig, "settle"));
    const moved = await edit("max", gig, { date: inDays(41) });
    expect(moved.status).toBe(409);
    expect(await errorOf(moved)).toBe("gig_settled");
    expect((await edit("max", gig, { title: "Other" })).status).toBe(409);
    expect((await edit("max", gig, { type: "private", showTime: "20:00" })).status).toBe(200);
    gig = await gigOf(await act("lea", gig, "postpone"));
    expect(gig.status).toBe("proposed");
    expect((await edit("max", gig, { date: inDays(41) })).status).toBe(200);
    const actions = (await activityOf(t.db, gig.id)).map((e) => e.action);
    expect(actions).toContain("gig.postponed");
  });

  test("cancelled: the reason, who and when; read-only, then deleted", async () => {
    let gig = await create("max", { date: inDays(50), title: "Birthday" });
    gig = await gigOf(await act("max", gig, "settle"));
    // A settled gig is cancelled before it is deleted.
    const refused = await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "max", { method: "DELETE" });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe("gig_settled");
    expect((await act("max", gig, "cancel", { reason: "  " })).status).toBe(400);
    memoryPush.sent.length = 0;
    const res = await act("max", gig, "cancel", { reason: "The couple postponed the wedding." });
    gig = await gigOf(res);
    expect(gig).toMatchObject({
      status: "cancelled",
      cancelledReason: "The couple postponed the wedding.",
      cancelledBy: "max name",
    });
    expect(gig.cancelledAt).not.toBeNull();
    expect(memoryPush.sent.map((push) => (push.payload as { body: string }).body)).toContain(
      "Concert annulé : Birthday, " +
        new Intl.DateTimeFormat("fr", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${gig.date}T12:00:00Z`)),
    );
    const locked = await edit("max", gig, { showTime: "20:00" });
    expect(await errorOf(locked)).toBe("gig_cancelled");
    expect(await errorOf(await act("lea", gig, "settle"))).toBe("gig_cancelled");
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "max", { method: "DELETE" })).status,
    ).toBe(204);
    expect((await call(`/bands/${slug}/gigs/${gig.id}`, "max")).status).toBe(404);
    expect((await activityOf(t.db, gig.id)).map((e) => e.action)).toEqual([
      "gig.created",
      "gig.settled",
      "gig.cancelled",
      "gig.deleted",
    ]);
  });

  test("a proposed gig is deleted directly; its venue stays", async () => {
    const gig = await create("max", {
      date: inDays(60),
      venue: { name: "La Péniche", city: "Rennes" },
    });
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "max", { method: "DELETE" })).status,
    ).toBe(204);
    const venues = (
      (await (await call(`/bands/${slug}/venues`, "max")).json()) as { venues: { id: string }[] }
    ).venues;
    expect(venues.map((venue) => venue.id)).toContain(gig.venue?.id ?? "");
  });

  test("past gigs are read-only once their day is over; delete stays", async () => {
    let gig = await create("max", { date: inDays(2), title: "Soon" });
    gig = await gigOf(await act("max", gig, "settle"));
    // Moved into the past behind the API's back.
    await t.db
      .update(gigs)
      .set({ date: inDays(-2) })
      .where(eq(gigs.id, gig.id));
    gig = { ...gig, date: inDays(-2) };
    expect(await errorOf(await edit("max", gig, { showTime: "20:00" }))).toBe("gig_past");
    expect(await errorOf(await act("max", gig, "postpone"))).toBe("gig_past");
    expect(await errorOf(await act("max", gig, "cancel", { reason: "Late" }))).toBe("gig_past");
    // Delete stays, for its creator or a band leader only.
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "sam", { method: "DELETE" })).status,
    ).toBe(403);
    expect(
      (await call(`/bands/${slug}/gigs/${gig.id}${tz}`, "max", { method: "DELETE" })).status,
    ).toBe(204);
  });
});

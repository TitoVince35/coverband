import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { APP_NAME, DOCUMENT_LIMITS } from "@coverband/shared";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import {
  activity,
  bandMembers,
  bands,
  invitations,
  memberInstruments,
  pushSubscriptions,
  rateLimits,
  songDocuments,
  songs,
  users,
} from "../../core/db/schema";
import { hit } from "../../core/http/rate-limit";
import { activityOf, createTestDeps } from "../../test-deps";
import { INVITATION_EMAILS } from "../invitations/routes";
import {
  hashToken,
  INVITATION_TTL_MS,
  inviteLeader,
  listLeaderInvitations,
} from "../invitations/service";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("admin API", () => {
  const { deps, db, sql, auth, mailer, storage } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const adminEmail = `admin-${run}@test.localhost`;
  const userEmail = `user-${run}@test.localhost`;
  const leaderEmail = `leader-${run}@test.localhost`;
  const password = "correct horse battery";
  let adminCookie = "";
  let adminId = "";

  async function login(email: string) {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    });
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
    return app.request(`/api/admin${path}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", cookie: init.cookie ?? adminCookie },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  /** Token from the link in the last email sent. */
  function lastToken() {
    const text = mailer.sent.at(-1)?.text ?? "";
    return /\/invite\/([\w-]+)/.exec(text)?.[1] ?? "";
  }

  beforeAll(async () => {
    const created = await auth.api.createUser({
      body: { email: adminEmail, password, name: "Ada Admin", role: "admin" },
    });
    adminId = created.user.id;
    await auth.api.createUser({ body: { email: userEmail, password, name: "Max Musician" } });
    adminCookie = await login(adminEmail);
  });

  afterAll(async () => {
    // Invitations go with their inviter (on delete cascade); activity outside a band doesn't.
    await db.delete(activity).where(eq(activity.actorId, adminId));
    await db.delete(bands).where(like(bands.slug, `%${run}%`));
    await db.delete(users).where(inArray(users.email, [adminEmail, userEmail]));
    await db.delete(rateLimits).where(eq(rateLimits.key, `coverband:invitation-emails:${adminId}`));
    await sql.end();
  });

  test("admins only", async () => {
    const userCookie = await login(userEmail);
    for (const path of ["/users", "/stats"]) {
      expect((await call(path, { cookie: "" })).status).toBe(401);
      expect((await call(path, { cookie: userCookie })).status).toBe(403);
    }
  });

  test("homepage numbers: every count, logged-in users as active", async () => {
    const res = await call("/stats");
    expect(res.status).toBe(200);
    const stats = (await res.json()) as Record<string, number>;
    expect(Object.keys(stats).sort()).toEqual([
      "activeUsers",
      "bands",
      "documents",
      "documentsBytes",
      "documentsQuotaBytes",
      "newBandsThisMonth",
      "pendingInvitations",
      "songs",
      "users",
    ]);
    for (const value of Object.values(stats)) expect(Number.isInteger(value)).toBe(true);
    // At least this test's admin and user, both logged in.
    expect(stats.users).toBeGreaterThanOrEqual(2);
    expect(stats.activeUsers).toBeGreaterThanOrEqual(2);
    expect(stats.newBandsThisMonth).toBeLessThanOrEqual(stats.bands ?? 0);
    expect(stats.documentsQuotaBytes).toBe((stats.bands ?? 0) * DOCUMENT_LIMITS.perBand);
  });

  test("lists users with their global role, searched by email or name (#249)", async () => {
    const res = await call(`/users?q=${run}&sort=email`);
    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      data: { email: string; role: string; banned: boolean }[];
      total: number;
    };
    expect(page.data.map((u) => [u.email, u.role, u.banned])).toEqual([
      [adminEmail, "admin", false],
      [userEmail, "user", false],
    ]);
    expect(page.total).toBe(2);
    const byName = (await (await call("/users?q=Max%20Musician")).json()) as {
      data: { email: string }[];
    };
    expect(byName.data.map((u) => u.email)).toContain(userEmail);
    const admins = (await (await call(`/users?q=${run}&admins=true`)).json()) as {
      data: { email: string }[];
    };
    expect(admins.data.map((u) => u.email)).toEqual([adminEmail]);
    expect((await call("/users?sort=password")).status).toBe(400);
  });

  describe("bands (#247)", () => {
    type Page = {
      data: { id: string; name: string; members: number; leaders: { name: string }[] }[];
      total: number;
    };
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      // Three bands: Alpha (2 members, a leader), Beta (1), Gamma_% (none, a name to escape).
      for (const [key, name] of [
        ["alpha", `Alpha ${run}`],
        ["beta", `Beta ${run}`],
        ["gamma", `Gamma_% ${run}`],
      ] as const) {
        const [band] = await db
          .insert(bands)
          .values({ name, slug: `${key}-${run}` })
          .returning({ id: bands.id });
        ids[key] = band?.id ?? "";
      }
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      // Join dates apart: one insert would give them all the same, and the lineup no fixed order.
      const day = (n: number) => new Date(Date.UTC(2026, 0, n));
      await db.insert(bandMembers).values([
        { bandId: ids.alpha ?? "", userId: adminId, role: "leader", joinedAt: day(1) },
        { bandId: ids.alpha ?? "", userId: user?.id ?? "", role: "musician", joinedAt: day(2) },
        { bandId: ids.beta ?? "", userId: user?.id ?? "", role: "leader", joinedAt: day(1) },
      ]);
      await db.insert(memberInstruments).values({
        bandId: ids.alpha ?? "",
        userId: user?.id ?? "",
        position: 0,
        code: "drums",
      });
      await db
        .insert(songs)
        .values({ bandId: ids.alpha ?? "", title: "Zombie", artist: "The Cranberries" });
    });

    const list = async (query: string) => (await (await call(`/bands?${query}`)).json()) as Page;

    test("admins only", async () => {
      const userCookie = await login(userEmail);
      expect((await call("/bands", { cookie: userCookie })).status).toBe(403);
      expect((await call(`/bands/${ids.alpha}`, { cookie: userCookie })).status).toBe(403);
    });

    test("a page: member count and leaders, searched by name", async () => {
      const page = await list(`q=${run}&sort=name`);
      expect(page.total).toBe(3);
      expect(page.data.map((b) => [b.name, b.members, b.leaders.map((l) => l.name)])).toEqual([
        [`Alpha ${run}`, 2, ["Ada Admin"]],
        [`Beta ${run}`, 1, ["Max Musician"]],
        [`Gamma_% ${run}`, 0, []],
      ]);
      // `%` and `_` are searched as themselves.
      expect((await list(`q=${encodeURIComponent(`_% ${run}`)}`)).total).toBe(1);
      expect((await list(`q=${encodeURIComponent(`a% ${run}`)}`)).total).toBe(0);
    });

    test("sorted and paged: the total is the whole search", async () => {
      const page = await list(`q=${run}&sort=members&order=desc&page=2&perPage=2`);
      expect(page.total).toBe(3);
      expect(page.data.map((b) => b.members)).toEqual([0]);
      expect((await call("/bands?sort=email")).status).toBe(400);
      expect((await call("/bands?perPage=1000")).status).toBe(400);
    });

    test("a band's page: lineup, counts, storage and journal", async () => {
      const res = await call(`/bands/${ids.alpha}`);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as {
        data: {
          name: string;
          lineup: { name: string; role: string; instruments: unknown[]; avatarUrl?: unknown }[];
          songs: number;
          documents: number;
          storage: { usedBytes: number; quotaBytes: number };
          journal: unknown[];
        };
      };
      expect(data.name).toBe(`Alpha ${run}`);
      expect(data.lineup.map((m) => [m.name, m.role, m.instruments])).toEqual([
        ["Ada Admin", "leader", []],
        ["Max Musician", "musician", [{ code: "drums" }]],
      ]);
      expect(data.lineup[0]).not.toHaveProperty("avatarUrl");
      expect(data).toMatchObject({
        songs: 1,
        documents: 0,
        storage: { usedBytes: 0, quotaBytes: DOCUMENT_LIMITS.perBand },
        journal: [],
      });
    });

    test("a suspended band only says so to its members, until it's enabled again (#248)", async () => {
      const userCookie = await login(userEmail);
      const bandPage = () =>
        app.request(`/api/bands/alpha-${run}`, { headers: { cookie: userCookie } });
      expect((await bandPage()).status).toBe(200);

      const disabled = await call(`/bands/${ids.alpha}/disable`, { method: "POST" });
      expect(disabled.status).toBe(200);
      expect(
        ((await disabled.json()) as { data: { disabledAt: string | null } }).data.disabledAt,
      ).not.toBeNull();
      const refused = await bandPage();
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ error: { code: "band_suspended" } });
      // Its features too, and the list says it.
      expect(
        (await app.request(`/api/bands/alpha-${run}/songs`, { headers: { cookie: userCookie } }))
          .status,
      ).toBe(403);
      const mine = (await (
        await app.request("/api/bands", { headers: { cookie: userCookie } })
      ).json()) as { bands: { slug: string; suspended: boolean }[] };
      expect(mine.bands.find((b) => b.slug === `alpha-${run}`)?.suspended).toBe(true);
      expect((await list(`q=Alpha ${run}`)).data[0]).toHaveProperty("disabledAt");

      // Twice changes nothing; enabling brings it back.
      expect((await call(`/bands/${ids.alpha}/disable`, { method: "POST" })).status).toBe(200);
      expect((await call(`/bands/${ids.alpha}/enable`, { method: "POST" })).status).toBe(200);
      expect((await bandPage()).status).toBe(200);
      expect((await activityOf(db, ids.alpha ?? "")).map((a) => a.action)).toEqual([
        "band.disabled",
        "band.enabled",
      ]);
      expect((await call(`/bands/${crypto.randomUUID()}/disable`, { method: "POST" })).status).toBe(
        404,
      );
    });

    test("a band is deleted only once disabled, its name typed, its files with it", async () => {
      const id = ids.gamma ?? "";
      const name = `Gamma_% ${run}`;
      const remove = (typed: string) =>
        call(`/bands/${id}`, { method: "DELETE", body: { name: typed } });
      // Its files: a document and a logo.
      const [song] = await db
        .insert(songs)
        .values({ bandId: id, title: "Linger", artist: "The Cranberries" })
        .returning({ id: songs.id });
      const documentKey = `bands/${id}/documents/chords.pdf`;
      await db.insert(songDocuments).values({
        bandId: id,
        songId: song?.id ?? "",
        title: "Chords",
        kind: "pdf",
        contentType: "application/pdf",
        extension: "pdf",
        size: 4,
        storageKey: documentKey,
      });
      const logoKey = `bands/${id}/logo/logo.webp`;
      await db
        .update(bands)
        .set({ logoKey, logoThumbnailKey: `${logoKey}-thumbnail` })
        .where(eq(bands.id, id));
      for (const key of [documentKey, logoKey, `${logoKey}-thumbnail`]) {
        await storage.put(key, new Uint8Array([1, 2, 3, 4]), "application/octet-stream");
      }

      const active = await remove(name);
      expect(active.status).toBe(409);
      expect(await active.json()).toMatchObject({ error: { code: "band_not_disabled" } });
      await call(`/bands/${id}/disable`, { method: "POST" });
      const mistyped = await remove(name.toUpperCase());
      expect(mistyped.status).toBe(400);
      expect(await mistyped.json()).toMatchObject({ error: { code: "band_name_mismatch" } });

      expect((await remove(` ${name} `)).status).toBe(200);
      expect(await db.select().from(bands).where(eq(bands.id, id))).toEqual([]);
      expect(await db.select().from(songs).where(eq(songs.bandId, id))).toEqual([]);
      expect([...storage.objects.keys()].filter((key) => key.includes(id))).toEqual([]);
      // Recorded outside the band (it's gone), with no name.
      expect(await activityOf(db, id)).toEqual([
        { action: "band.deleted", bandId: null, actorId: adminId, targetType: "band", data: null },
      ]);
      expect((await remove(name)).status).toBe(404);
    });

    test("an unknown band is a 404, a malformed id a 400", async () => {
      expect((await call(`/bands/${crypto.randomUUID()}`)).status).toBe(404);
      expect((await call("/bands/nope")).status).toBe(400);
    });
  });

  describe("users (#249)", () => {
    const run2 = crypto.randomUUID().slice(0, 8);
    const email = (name: string) => `${name}-${run2}@test.localhost`;
    const ids: Record<string, string> = {};
    let bandId = "";

    beforeAll(async () => {
      for (const name of ["lea", "max", "solo"]) {
        const { user } = await auth.api.createUser({
          body: { email: email(name), password, name: `${name} ${run2}` },
        });
        ids[name] = user.id;
      }
      // Lea and Max lead a band together, Max plays in it too; Solo is in no band.
      const [band] = await db
        .insert(bands)
        .values({ name: `Duo ${run2}`, slug: `duo-${run2}` })
        .returning({ id: bands.id });
      bandId = band?.id ?? "";
      await db.insert(bandMembers).values([
        { bandId, userId: ids.lea ?? "", role: "leader" },
        { bandId, userId: ids.max ?? "", role: "leader" },
      ]);
      await db.insert(memberInstruments).values([
        { bandId, userId: ids.lea ?? "", position: 0, code: "guitar" },
        { bandId, userId: ids.lea ?? "", position: 1, label: "Kazoo" },
      ]);
    });

    afterAll(async () => {
      await db.delete(bands).where(eq(bands.id, bandId));
      await db.delete(users).where(like(users.email, `%-${run2}@test.localhost`));
    });

    type User = {
      email: string;
      bands: { name: string; role: string }[];
      instruments: unknown[];
      banned: boolean;
      impersonateUrl?: string | null;
      pendingInvitations?: unknown[];
      lastSessionAt?: string | null;
      pushDevices: number | { service: string; language: string }[];
    };
    const page = async (query: string) =>
      (await (await call(`/users?${query}`)).json()) as { data: User[]; total: number };

    test("bands with the role in each, instruments without duplicates; the no-band filter", async () => {
      const { data } = await page(`q=${run2}&sort=email`);
      expect(data.map((u) => [u.email, u.bands, u.instruments])).toEqual([
        [
          email("lea"),
          [{ id: bandId, name: `Duo ${run2}`, slug: `duo-${run2}`, role: "leader" }],
          [{ code: "guitar" }, { label: "Kazoo" }],
        ],
        [
          email("max"),
          [{ id: bandId, name: `Duo ${run2}`, slug: `duo-${run2}`, role: "leader" }],
          [],
        ],
        [email("solo"), [], []],
      ]);
      expect((await page(`q=${run2}&bandless=true`)).data.map((u) => u.email)).toEqual([
        email("solo"),
      ]);
    });

    test("a user's page: the last session, and the link to view the app as them", async () => {
      await login(email("solo"));
      const res = await call(`/users/${ids.solo}`);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: User };
      expect(data.lastSessionAt).not.toBeNull();
      expect(data.pendingInvitations).toEqual([]);
      expect(data.impersonateUrl).toBe(`http://localhost:3000/impersonate/${ids.solo}`);
      // Never for an admin (oneself included).
      const self = (await (await call(`/users/${adminId}`)).json()) as { data: User };
      expect(self.data.impersonateUrl).toBeNull();
      expect((await call(`/users/${crypto.randomUUID()}`)).status).toBe(404);
    });

    test("push notifications: devices counted in the list, named by their service on the page", async () => {
      await db.insert(pushSubscriptions).values([
        {
          userId: ids.lea ?? "",
          endpoint: `https://fcm.googleapis.com/fcm/send/${run2}`,
          p256dh: "p",
          auth: "a",
        },
        {
          userId: ids.lea ?? "",
          endpoint: `https://web.push.apple.com/${run2}`,
          p256dh: "p",
          auth: "a",
          language: "fr",
        },
      ]);
      const { data } = await page(`q=${run2}&sort=email`);
      expect(data.map((u) => u.pushDevices)).toEqual([2, 0, 0]);
      const lea = (await (await call(`/users/${ids.lea}`)).json()) as { data: User };
      const devices = lea.data.pushDevices as Record<string, unknown>[];
      expect(devices.map(({ service, language }) => ({ service, language }))).toEqual([
        { service: "Google", language: "en" },
        { service: "Apple", language: "fr" },
      ]);
      // Never the endpoint: whoever has it can push to the device.
      expect(JSON.stringify(lea.data)).not.toContain("googleapis");
      expect(devices.every((device) => !("endpoint" in device))).toBe(true);
    });

    test("blocking ends the sessions and refuses logins, until unblocked", async () => {
      const cookie = await login(email("solo"));
      const session = () => app.request("/api/bands", { headers: { cookie } });
      expect((await session()).status).toBe(200);

      expect((await call(`/users/${ids.solo}/ban`, { method: "POST" })).status).toBe(200);
      expect((await session()).status).toBe(401);
      expect(await login(email("solo"))).toBe("");
      expect((await page(`q=solo-${run2}`)).data[0]?.banned).toBe(true);

      expect((await call(`/users/${ids.solo}/unban`, { method: "POST" })).status).toBe(200);
      expect(await login(email("solo"))).not.toBe("");
      expect((await activityOf(db, ids.solo ?? "")).map((a) => a.action)).toEqual([
        "user.banned",
        "user.unbanned",
      ]);
      // Never an admin, nor oneself.
      expect((await call(`/users/${adminId}/ban`, { method: "POST" })).status).toBe(403);
    });

    test("a password reset email, in the language of their latest invitation", async () => {
      const sent = mailer.sent.length;
      const res = await call(`/users/${ids.solo}/password-reset`, { method: "POST" });
      expect(res.status).toBe(204);
      expect(mailer.sent.length).toBe(sent + 1);
      expect(mailer.sent.at(-1)?.to).toBe(email("solo"));
      expect(mailer.sent.at(-1)?.text).toContain("/api/auth/reset-password/");
    });

    test("deleting: refused for the only band leader of a band, then done", async () => {
      // Lea leads with Max: either may go, but not both.
      expect((await call(`/users/${ids.max}`, { method: "DELETE" })).status).toBe(200);
      const refused = await call(`/users/${ids.lea}`, { method: "DELETE" });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({
        error: { code: "only_band_leader", details: { bands: `Duo ${run2}` } },
      });
      expect((await call(`/users/${ids.solo}`, { method: "DELETE" })).status).toBe(200);
      expect(
        await db
          .select()
          .from(users)
          .where(eq(users.id, ids.solo ?? "")),
      ).toEqual([]);
      expect((await activityOf(db, ids.solo ?? "")).at(-1)).toMatchObject({
        action: "user.deleted",
        bandId: null,
        actorId: adminId,
      });
      expect((await call(`/users/${adminId}`, { method: "DELETE" })).status).toBe(403);
      expect((await call(`/users/${ids.solo}`, { method: "DELETE" })).status).toBe(404);
    });
  });

  test("invites a band leader: email with a link, only the token hash stored", async () => {
    const res = await call("/invitations", {
      method: "POST",
      body: { email: ` ${leaderEmail.toUpperCase()} `, language: "fr" },
    });
    expect(res.status).toBe(201);
    const {
      data: { id },
    } = (await res.json()) as { data: { id: string } };

    const mail = mailer.sent.at(-1);
    expect(mail?.to).toBe(leaderEmail);
    expect(mail?.subject).toBe(`Créez votre groupe sur ${APP_NAME}`);
    expect(mail?.text).toContain("Ada Admin");
    const token = lastToken();
    expect(token.length).toBeGreaterThan(40);

    const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(row?.role).toBe("leader");
    const ttl = (row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0);
    expect(Math.abs(ttl - INVITATION_TTL_MS)).toBeLessThan(60_000);

    const list = (await (await call("/invitations")).json()) as {
      data: { id: string; email: string; status: string; invitedBy: string }[];
      total: number;
    };
    expect(list.total).toBe(list.data.length);
    expect(list.data.find((i) => i.id === id)).toMatchObject({
      email: leaderEmail,
      status: "pending",
      invitedBy: "Ada Admin",
    });

    // IDs only: no email in the activity.
    expect(await activityOf(db, id)).toEqual([
      {
        action: "invitation.sent",
        bandId: null,
        actorId: adminId,
        targetType: "invitation",
        data: { role: "leader" },
      },
    ]);
  });

  test("a second invitation for the same email is refused while the first is open", async () => {
    const res = await call("/invitations", {
      method: "POST",
      body: { email: leaderEmail, language: "en" },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("already_invited");
  });

  test("invalid input is a 400 bad_request", async () => {
    const res = await call("/invitations", {
      method: "POST",
      body: { email: "not an email", language: "de" },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("bad_request");
    expect((await call("/invitations/not-a-uuid", { method: "DELETE" })).status).toBe(400);
  });

  test("resend sends a new link and the old one stops working", async () => {
    const [before] = await db.select().from(invitations).where(eq(invitations.email, leaderEmail));
    const oldToken = lastToken();

    const res = await call(`/invitations/${before?.id}/resend`, { method: "POST" });
    expect(res.status).toBe(200);
    const newToken = lastToken();
    expect(newToken).not.toBe(oldToken);
    const [after] = await db.select().from(invitations).where(eq(invitations.email, leaderEmail));
    expect(after?.tokenHash).toBe(hashToken(newToken));
    expect(after?.expiresAt.getTime()).toBeGreaterThanOrEqual(before?.expiresAt.getTime() ?? 0);
    expect((await activityOf(db, before?.id ?? "")).at(-1)).toMatchObject({
      action: "invitation.resent",
      actorId: adminId,
    });
  });

  test("revoke hides the invitation; revoking or resending again is a 404", async () => {
    const [row] = await db.select().from(invitations).where(eq(invitations.email, leaderEmail));
    expect((await call(`/invitations/${row?.id}`, { method: "DELETE" })).status).toBe(200);

    const list = (await (await call("/invitations")).json()) as { data: { id: string }[] };
    expect(list.data.some((i) => i.id === row?.id)).toBe(false);
    expect((await call(`/invitations/${row?.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await call(`/invitations/${row?.id}/resend`, { method: "POST" })).status).toBe(404);
    // Refused attempts record nothing.
    expect((await activityOf(db, row?.id ?? "")).map((a) => a.action)).toEqual([
      "invitation.sent",
      "invitation.resent",
      "invitation.revoked",
    ]);
  });

  test("an expired invitation shows as expired and the email can be invited again", async () => {
    const email = `expired-${run}@test.localhost`;
    const past = () => new Date(Date.now() - INVITATION_TTL_MS - 1000);
    await inviteLeader({ ...deps, now: past }, { email, language: "en", invitedById: adminId });

    const listed = await listLeaderInvitations(deps);
    expect(listed.find((i) => i.email === email)?.status).toBe("expired");
    const again = await call("/invitations", { method: "POST", body: { email, language: "en" } });
    expect(again.status).toBe(201);
  });

  test("if the email can't be sent, no invitation (nor activity) is left behind", async () => {
    const email = `unsent-${run}@test.localhost`;
    const recorded = async () =>
      (await db.select().from(activity).where(eq(activity.actorId, adminId))).length;
    const before = await recorded();
    const failing = {
      ...deps,
      mailer: {
        send: async () => {
          throw new Error("SMTP down");
        },
      },
    };
    expect(inviteLeader(failing, { email, language: "en", invitedById: adminId })).rejects.toThrow(
      "SMTP down",
    );
    await Bun.sleep(50);
    expect(await db.select().from(invitations).where(eq(invitations.email, email))).toHaveLength(0);
    expect(await recorded()).toBe(before);
  });

  test("invitation emails are rate limited per admin (last: fills the bucket)", async () => {
    const [pending] = await listLeaderInvitations(deps);
    for (let i = 0; i < INVITATION_EMAILS.max; i++) {
      await hit(db, INVITATION_EMAILS, adminId);
    }
    const body = { email: `limited-${run}@test.localhost`, language: "en" };
    const sent = await call("/invitations", { method: "POST", body });
    expect(sent.status).toBe(429);
    expect(sent.headers.get("retry-after")).toBeTruthy();
    expect(((await sent.json()) as { error: { code: string } }).error.code).toBe(
      "too_many_requests",
    );
    const resent = await call(`/invitations/${pending?.id}/resend`, { method: "POST" });
    expect(resent.status).toBe(429);
  });
});

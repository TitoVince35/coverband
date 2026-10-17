import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like, sql as sqlExpr } from "drizzle-orm";
import { createApp } from "../app";
import { activity, bands, invitations, users } from "../db/schema";
import { INVITATION_TTL_MS, inviteLeader, revokeLeaderInvitation } from "../invitations";
import { activityOf, createTestDeps } from "../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("leader onboarding", () => {
  const { deps, db, sql, auth, mailer } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const bandName = (name: string) => `${name} ${run}`;
  const password = "correct horse battery";
  let adminId = "";

  const profile = { firstName: "Jean", lastName: "Dupont", nickname: "JD", password };

  /** Invites a leader and returns the token from the email's link. */
  async function invite(to: string, now?: () => Date) {
    await inviteLeader(
      { ...deps, ...(now ? { now } : {}) },
      { email: to, language: "fr", invitedById: adminId },
    );
    return /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1] ?? "";
  }

  function accept(token: string, body: unknown, cookie = "") {
    return app.request(`/api/invitations/${token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    });
  }

  async function login(address: string) {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: address, password }),
    });
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  beforeAll(async () => {
    const admin = await auth.api.createUser({
      body: { email: email("admin"), password, name: "Ada Admin", role: "admin" },
    });
    adminId = admin.user.id;
  });

  afterAll(async () => {
    // Activity outside a band (leader invitations, new accounts) stays when users are deleted.
    const testUsers = db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%-${run}@test.localhost`));
    await db.delete(activity).where(inArray(activity.actorId, testUsers));
    await db.delete(bands).where(like(bands.name, `% ${run}%`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("shows a valid invitation; unknown links are a 404", async () => {
    const token = await invite(email("show"));
    const res = await app.request(`/api/invitations/${token}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: email("show"),
      role: "leader",
      language: "fr",
      inviterName: "Ada Admin",
      bandName: null,
      hasAccount: false,
    });

    const unknown = await app.request(`/api/invitations/${"x".repeat(43)}`);
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe("invitation_not_found");
  });

  test("checks band name availability, case-insensitively", async () => {
    const token = await invite(email("names"));
    await db.insert(bands).values({ name: bandName("Taken Band"), slug: `taken-band-${run}` });
    const check = async (name: string) =>
      (
        (await (
          await app.request(`/api/invitations/${token}/band-name?name=${encodeURIComponent(name)}`)
        ).json()) as { available: boolean }
      ).available;
    expect(await check(bandName("TAKEN band"))).toBe(false);
    expect(await check(bandName("Free Band"))).toBe(true);
  });

  test("a new leader gets an account, a band and a session in one go", async () => {
    const token = await invite(email("new"));
    const body = { instrument: "Guitar", bandName: bandName("Les Rockeurs d'Été"), genre: "Rock" };

    expect((await accept(token, body)).status).toBe(400); // no profile
    expect(
      (await accept(token, { ...body, newAccount: { ...profile, password: "short" } })).status,
    ).toBe(400);

    const res = await accept(token, { ...body, newAccount: profile });
    expect(res.status).toBe(201);
    const { bandSlug } = (await res.json()) as { bandSlug: string };
    expect(bandSlug).toBe(`les-rockeurs-d-ete-${run}`);

    // Logged in straight away, as the band's leader.
    const cookie = cookieOf(res);
    const mine = await app.request("/api/bands", { headers: { cookie } });
    expect(await mine.json()).toEqual({
      bands: [
        {
          name: body.bandName,
          slug: bandSlug,
          genre: "Rock",
          role: "leader",
          instrument: "Guitar",
        },
      ],
    });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email("new")));
    expect(user).toMatchObject({
      name: "JD",
      firstName: "Jean",
      lastName: "Dupont",
      emailVerified: true,
      role: "user",
    });
    expect(await login(email("new"))).toContain("session_token");

    const [band] = await db.select().from(bands).where(eq(bands.slug, bandSlug));
    const [invitation] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(eq(invitations.email, email("new")));
    const by = { actorId: user?.id };
    expect(await activityOf(db, user?.id ?? "")).toMatchObject([
      {
        ...by,
        action: "member.joined",
        bandId: band?.id,
        data: { role: "leader", invitationId: invitation?.id },
      },
      { ...by, action: "user.registered", bandId: null, data: { invitationId: invitation?.id } },
    ]);
    expect(await activityOf(db, band?.id ?? "")).toMatchObject([
      { ...by, action: "band.created", bandId: band?.id, targetType: "band", data: null },
    ]);

    // The link works only once.
    const again = await accept(token, { ...body, newAccount: profile });
    expect(again.status).toBe(410);
    expect(await errorCode(again)).toBe("invitation_used");
  });

  test("a taken band name is refused and nothing is created", async () => {
    const token = await invite(email("clash"));
    await db.insert(bands).values({ name: bandName("Clash"), slug: `clash-${run}` });
    const res = await accept(token, {
      instrument: "Drums",
      bandName: bandName("CLASH"),
      newAccount: profile,
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("band_name_taken");
    expect(
      await db
        .select()
        .from(users)
        .where(eq(users.email, email("clash"))),
    ).toHaveLength(0);
    // The events of the failed transaction are gone with it.
    const [invitation] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(eq(invitations.email, email("clash")));
    expect(
      await db
        .select()
        .from(activity)
        .where(sqlExpr`${activity.data}->>'invitationId' = ${invitation?.id}`),
    ).toHaveLength(0);
  });

  test("expired and revoked invitations can't be used", async () => {
    const past = () => new Date(Date.now() - INVITATION_TTL_MS - 1000);
    const expired = await invite(email("expired"), past);
    const res = await app.request(`/api/invitations/${expired}`);
    expect(res.status).toBe(410);
    expect(await errorCode(res)).toBe("invitation_expired");

    const token = await invite(email("revoked"));
    const [row] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(eq(invitations.email, email("revoked")));
    await revokeLeaderInvitation(deps, row?.id ?? "", adminId);
    const revoked = await accept(token, {
      instrument: "Bass",
      bandName: bandName("Revoked"),
      newAccount: profile,
    });
    expect(revoked.status).toBe(410);
    expect(await errorCode(revoked)).toBe("invitation_revoked");
  });

  test("someone with an account must log in with it, and only creates the band", async () => {
    await auth.api.createUser({ body: { email: email("existing"), password, name: "Existing" } });
    await auth.api.createUser({ body: { email: email("other"), password, name: "Other" } });
    const token = await invite(email("existing"));
    const info = (await (await app.request(`/api/invitations/${token}`)).json()) as {
      hasAccount: boolean;
    };
    expect(info.hasAccount).toBe(true);

    // Same name as an existing slug: gets a suffix.
    await db.insert(bands).values({ name: bandName("Slug Twin X"), slug: `slug-twin-${run}` });
    const body = { instrument: "Vocals", bandName: bandName("Slug Twin") };

    expect((await accept(token, body)).status).toBe(401);
    const wrong = await accept(token, body, await login(email("other")));
    expect(wrong.status).toBe(403);
    expect(await errorCode(wrong)).toBe("invitation_wrong_account");

    const cookie = await login(email("existing"));
    const res = await accept(token, body, cookie);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { bandSlug: string }).bandSlug).toBe(`slug-twin-${run}-2`);

    // An existing account: the band and the membership, no registration.
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email("existing")));
    expect((await activityOf(db, user?.id ?? "")).map((a) => a.action)).toEqual(["member.joined"]);
  });

  test("a band page is only visible to its members", async () => {
    const [band] = await db
      .select({ slug: bands.slug })
      .from(bands)
      .where(inArray(bands.name, [bandName("Les Rockeurs d'Été")]));
    const path = `/api/bands/${band?.slug}`;
    expect(
      (await app.request(path, { headers: { cookie: await login(email("new")) } })).status,
    ).toBe(200);
    expect(
      (await app.request(path, { headers: { cookie: await login(email("other")) } })).status,
    ).toBe(404);
    expect((await app.request(path)).status).toBe(401);
  });
});

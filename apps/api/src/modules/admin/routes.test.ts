import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { APP_NAME } from "@coverband/shared";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, invitations, rateLimits, users } from "../../core/db/schema";
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
  const { deps, db, sql, auth, mailer } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

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
    await db.delete(users).where(inArray(users.email, [adminEmail, userEmail]));
    await db.delete(rateLimits).where(eq(rateLimits.key, `coverband:invitation-emails:${adminId}`));
    await sql.end();
  });

  test("admins only", async () => {
    expect((await call("/users", { cookie: "" })).status).toBe(401);
    expect((await call("/users", { cookie: await login(userEmail) })).status).toBe(403);
  });

  test("lists users with their global role", async () => {
    const res = await call("/users");
    expect(res.status).toBe(200);
    const { users: rows } = (await res.json()) as { users: { email: string; role: string }[] };
    expect(rows.find((u) => u.email === adminEmail)?.role).toBe("admin");
    expect(rows.find((u) => u.email === userEmail)?.role).toBe("user");
  });

  test("invites a band leader: email with a link, only the token hash stored", async () => {
    const res = await call("/invitations", {
      method: "POST",
      body: { email: ` ${leaderEmail.toUpperCase()} `, language: "fr" },
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

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
      invitations: { id: string; email: string; status: string; invitedBy: string }[];
    };
    expect(list.invitations.find((i) => i.id === id)).toMatchObject({
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
    expect((await call(`/invitations/${row?.id}`, { method: "DELETE" })).status).toBe(204);

    const list = (await (await call("/invitations")).json()) as { invitations: { id: string }[] };
    expect(list.invitations.some((i) => i.id === row?.id)).toBe(false);
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

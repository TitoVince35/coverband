import { afterAll, describe, expect, test } from "bun:test";
import { APP_NAME } from "@coverband/shared";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createApp } from "../app";
import { ensureAdmin } from "../bootstrap";
import { users, verifications } from "../core/db/schema";
import { requestLog } from "../core/http/request-log";
import { loadSession, requireAdmin, requireUser, type SessionEnv } from "../core/http/session";
import { createMemoryLogger, silentLogger } from "../core/log";
import { createTestDeps } from "../test-deps";
import { betterAuthLogger, createAuth, requestLanguage } from "./auth";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("authentication", () => {
  const { deps, db, sql, auth, mailer } = createTestDeps(databaseUrl);
  const app = createApp({ deps });

  // Unique emails so tests never collide with development data; deleted afterwards.
  const run = crypto.randomUUID().slice(0, 8);
  const adminEmail = `admin-${run}@test.localhost`;
  const userEmail = `user-${run}@test.localhost`;
  const resetEmail = `reset-${run}@test.localhost`;
  const password = "correct horse battery";

  afterAll(async () => {
    // Reset links that were never used point to the user by id.
    const ids = (
      await db.select({ id: users.id }).from(users).where(eq(users.email, resetEmail))
    ).map((u) => u.id);
    if (ids.length > 0) await db.delete(verifications).where(inArray(verifications.value, ids));
    await db.delete(users).where(inArray(users.email, [adminEmail, userEmail, resetEmail]));
    await sql.end();
  });

  // A small app behind the guards, the way real routes will use them.
  const guarded = new Hono<SessionEnv>()
    .use(requestLog(silentLogger))
    .use(loadSession(auth))
    .get("/user", requireUser, (c) => c.json({ email: c.var.user?.email }))
    .get("/admin", requireAdmin, (c) => c.json({ ok: true }));

  async function login(email: string, pass: string) {
    return app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password: pass }),
    });
  }

  function cookieOf(res: Response) {
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  test("creates the default admin once and never changes it afterwards", async () => {
    expect(await ensureAdmin(auth, { email: adminEmail, password })).toBe("created");
    expect(await ensureAdmin(auth, { email: adminEmail, password: "another password!" })).toBe(
      "exists",
    );
    expect((await login(adminEmail, password)).status).toBe(200);
    expect((await login(adminEmail, "another password!")).status).toBe(401);
  });

  test("public sign-up is refused", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: `signup-${run}@test.localhost`, password, name: "Nope" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const created = await db
      .select()
      .from(users)
      .where(inArray(users.email, [`signup-${run}@test.localhost`]));
    expect(created).toHaveLength(0);
  });

  test("guards: anonymous gets 401 with an error code", async () => {
    const res = await guarded.request("/user");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Not logged in" } });
  });

  test("guards: a logged-in user passes requireUser but not requireAdmin", async () => {
    await auth.api.createUser({ body: { email: userEmail, password, name: "Musician" } });
    const cookie = cookieOf(await login(userEmail, password));

    const user = await guarded.request("/user", { headers: { cookie } });
    expect(await user.json()).toEqual({ email: userEmail });
    const admin = await guarded.request("/admin", { headers: { cookie } });
    expect(admin.status).toBe(403);
    expect(await admin.json()).toEqual({ error: { code: "forbidden", message: "Admins only" } });
  });

  test("new passwords shorter than the policy are refused", async () => {
    const cookie = cookieOf(await login(userEmail, password));
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ currentPassword: password, newPassword: "too short" }),
    });
    expect(res.status).toBe(400);
    expect((await login(userEmail, password)).status).toBe(200);
  });

  test("guards: the admin passes requireAdmin, and logging out ends the session", async () => {
    const cookie = cookieOf(await login(adminEmail, password));
    expect((await guarded.request("/admin", { headers: { cookie } })).status).toBe(200);

    const out = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: "http://localhost:3000" },
    });
    expect(out.status).toBe(200);
    expect((await guarded.request("/admin", { headers: { cookie } })).status).toBe(401);
  });

  describe("password reset and change (#24)", () => {
    const newPassword = "a brand new passphrase";

    function post(path: string, body: unknown, headers: Record<string, string> = {}) {
      return app.request(`/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    }

    /** Token from the reset link of the last email sent. */
    function lastResetToken() {
      const mail = mailer.sent.at(-1);
      const match = mail?.text.match(/\/api\/auth\/reset-password\/([\w-]+)\?/);
      if (!match?.[1]) throw new Error("No reset link in the last email");
      return match[1];
    }

    test("an unknown email gets the same answer as a known one, and no email", async () => {
      await auth.api.createUser({ body: { email: resetEmail, password, name: "Reset" } });
      const before = mailer.sent.length;

      const unknown = await post("/request-password-reset", {
        email: `nobody-${run}@test.localhost`,
      });
      const known = await post("/request-password-reset", { email: resetEmail });

      expect(unknown.status).toBe(200);
      expect(await unknown.json()).toEqual(await known.json());
      expect(mailer.sent.length).toBe(before + 1);
      expect(mailer.sent.at(-1)?.to).toBe(resetEmail);
    });

    test("a failed send gets the same answer, and is logged without the email", async () => {
      const { log, entries } = createMemoryLogger();
      const failing = createAuth({
        db,
        log,
        mailer: {
          send: async () => {
            throw new Error("SMTP down");
          },
        },
        secret: "test-secret-test-secret-test-secret",
        baseURL: "http://localhost:3000",
        rateLimit: false,
      });
      const res = await failing.api.requestPasswordReset({ body: { email: resetEmail } });
      expect(res.status).toBe(true);
      const [user] = await db.select().from(users).where(eq(users.email, resetEmail));
      expect(entries).toMatchObject([
        {
          level: "error",
          msg: "Password reset email not sent",
          userId: user?.id,
          err: { message: "SMTP down" },
        },
      ]);
      expect(JSON.stringify(entries)).not.toContain(resetEmail);
    });

    test("the email is in the language sent by the web app", async () => {
      await post("/request-password-reset", { email: resetEmail }, { "accept-language": "fr" });
      expect(mailer.sent.at(-1)?.subject).toBe(`Réinitialisez votre mot de passe ${APP_NAME}`);
      expect(mailer.sent.at(-1)?.text).toContain("http://localhost:3000/api/auth/reset-password/");
    });

    test("the link checks the token, then opens the web app's reset page", async () => {
      await post("/request-password-reset", { email: resetEmail });
      const token = lastResetToken();
      const open = (t: string) =>
        app.request(`/api/auth/reset-password/${t}?callbackURL=%2Freset-password`);

      expect((await open(token)).headers.get("location")).toBe(
        `http://localhost:3000/reset-password?token=${token}`,
      );
      expect((await open("not-a-token")).headers.get("location")).toBe(
        "http://localhost:3000/reset-password?error=INVALID_TOKEN",
      );
    });

    test("the link sets a new password once, and logs out every session", async () => {
      const cookie = cookieOf(await login(resetEmail, password));
      await post("/request-password-reset", { email: resetEmail });
      const token = lastResetToken();

      expect((await post("/reset-password", { token, newPassword: "too short" })).status).toBe(400);
      expect((await post("/reset-password", { token, newPassword })).status).toBe(200);
      expect((await post("/reset-password", { token, newPassword })).status).toBe(400);

      expect((await guarded.request("/user", { headers: { cookie } })).status).toBe(401);
      expect((await login(resetEmail, password)).status).toBe(401);
      expect((await login(resetEmail, newPassword)).status).toBe(200);
    });

    test("an expired link is refused", async () => {
      await post("/request-password-reset", { email: resetEmail });
      const token = lastResetToken();
      await db
        .update(verifications)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(verifications.identifier, `reset-password:${token}`));

      expect((await post("/reset-password", { token, newPassword: password })).status).toBe(400);
      await db.delete(verifications).where(eq(verifications.identifier, `reset-password:${token}`));
      expect((await login(resetEmail, newPassword)).status).toBe(200);
    });

    test("changing the password needs the current one and logs out the other sessions", async () => {
      const other = cookieOf(await login(resetEmail, newPassword));
      const current = cookieOf(await login(resetEmail, newPassword));

      const wrong = await post(
        "/change-password",
        { currentPassword: "not the password", newPassword: password, revokeOtherSessions: true },
        { cookie: current },
      );
      expect(wrong.status).toBe(400);

      const res = await post(
        "/change-password",
        { currentPassword: newPassword, newPassword: password, revokeOtherSessions: true },
        { cookie: current },
      );
      expect(res.status).toBe(200);
      expect((await guarded.request("/user", { headers: { cookie: other } })).status).toBe(401);
      const renewed = cookieOf(res);
      expect((await guarded.request("/user", { headers: { cookie: renewed } })).status).toBe(200);
      expect((await login(resetEmail, password)).status).toBe(200);
    });
  });
});

describe("betterAuthLogger", () => {
  test("Better Auth's logs in our format, emails masked", () => {
    const { log, entries } = createMemoryLogger();
    const logger = betterAuthLogger(log);
    logger.log("info", "Sign-up attempt for existing email: Jane.Doe+band@example.com");
    logger.log("error", "Failed to run background task:", new Error("boom"));
    logger.log("warn", "Invalid id token", { provider: "x" });
    expect(entries).toMatchObject([
      { level: "info", msg: "Better Auth: Sign-up attempt for existing email: [email]" },
      {
        level: "error",
        msg: "Better Auth: Failed to run background task:",
        err: { message: "boom" },
      },
      { level: "warn", msg: "Better Auth: Invalid id token", args: [{ provider: "x" }] },
    ]);
  });
});

describe("requestLanguage", () => {
  test("picks the first supported language of Accept-Language, else English", () => {
    const req = (value: string) =>
      new Request("http://x", { headers: { "accept-language": value } });
    expect(requestLanguage(req("fr"))).toBe("fr");
    expect(requestLanguage(req("de-DE,fr-FR;q=0.8,en;q=0.5"))).toBe("fr");
    expect(requestLanguage(req("de"))).toBe("en");
    expect(requestLanguage(undefined)).toBe("en");
  });
});

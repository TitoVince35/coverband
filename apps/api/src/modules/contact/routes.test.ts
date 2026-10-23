import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../app";
import { activity, rateLimits, users } from "../../core/db/schema";
import { hit } from "../../core/http/rate-limit";
import { activityOf, createTestDeps } from "../../test-deps";
import { CONTACT_EMAILS } from "./routes";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("contact form (#234)", () => {
  const { deps, db, sql, auth, mailer } = createTestDeps(databaseUrl);
  const app = createApp({ deps: { ...deps, contactRecipient: "team@test.localhost" } });
  const without = createApp({ deps });

  const run = crypto.randomUUID().slice(0, 8);
  const email = `contact-${run}@test.localhost`;
  const password = "correct horse battery";
  let cookie = "";
  let userId = "";

  const send = (body: unknown, server = app, headers: Record<string, string> = {}) =>
    server.request("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...headers },
      body: JSON.stringify(body),
    });
  const bug = {
    subject: "bug",
    message: "The setlist page\n\ncrashes <b>on</b> save.",
    page: "/b/rockers/songs",
    language: "fr",
  };

  beforeAll(async () => {
    userId = (await auth.api.createUser({ body: { email, password, name: "Lea <Leader>" } })).user
      .id;
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    });
    cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });

  afterAll(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `coverband:${CONTACT_EMAILS.name}:%`));
    await db.delete(activity).where(eq(activity.actorId, userId));
    await db.delete(users).where(inArray(users.email, [email]));
    await sql.end();
  });

  test("offered only with a recipient, to logged-in users", async () => {
    const offered = (server: typeof app, withCookie = cookie) =>
      server.request("/api/contact", { headers: { cookie: withCookie } });
    expect(await (await offered(app)).json()).toEqual({ available: true });
    expect(await (await offered(without)).json()).toEqual({ available: false });
    expect((await offered(app, "")).status).toBe(401);
    expect((await send(bug, without)).status).toBe(404);
  });

  test("a bug report: an English email to the team, replies to the user, with its context", async () => {
    const res = await send(bug, app, { "user-agent": "Mozilla/5.0 (Pixel 7)" });
    expect(res.status).toBe(204);
    const mail = mailer.sent.at(-1);
    expect(mail?.to).toBe("team@test.localhost");
    expect(mail?.replyTo).toBe(email);
    // From the subject's code: nothing typed in a header.
    expect(mail?.subject).toBe("Coverband Beta: Bug report");
    expect(mail?.text).toContain("From Lea <Leader>");
    expect(mail?.text).toContain("The setlist page");
    expect(mail?.text).toContain("Version: 0.0.0-test (test)");
    expect(mail?.text).toContain("Page: /b/rockers/songs");
    expect(mail?.text).toContain("Browser: Mozilla/5.0 (Pixel 7)");
    expect(mail?.text).toContain("Language: fr");
    // Escaped in the HTML.
    expect(mail?.html).toContain("crashes &lt;b&gt;on&lt;/b&gt; save.");
    expect(mail?.html).not.toContain("<b>on</b>");
    // The subject's code only, never the message.
    expect((await activityOf(db, userId)).at(-1)).toEqual({
      action: "contact.sent",
      bandId: null,
      actorId: userId,
      targetType: "user",
      data: { subject: "bug" },
    });
  });

  test("other subjects carry no context", async () => {
    const res = await send({ subject: "praise", message: "Great app, thanks!", language: "en" });
    expect(res.status).toBe(204);
    expect(mailer.sent.at(-1)?.subject).toBe("Coverband Beta: Praise");
    expect(mailer.sent.at(-1)?.text).not.toContain("Version:");
  });

  test("a subject from the list and a message of 10 to 5,000 characters", async () => {
    const message = "A long enough message.";
    for (const body of [
      { subject: "spam", message, language: "en" },
      { message, language: "en" },
      { subject: "other", message: "   short  ", language: "en" },
      { subject: "other", message: "x".repeat(5001), language: "en" },
      { subject: "bug", message, page: "https://evil.example", language: "en" },
    ]) {
      expect((await send(body)).status).toBe(400);
    }
  });

  test("a failed send is an error, and records nothing", async () => {
    const failing = createApp({
      deps: {
        ...deps,
        contactRecipient: "team@test.localhost",
        mailer: {
          send: async () => {
            throw new Error("SMTP down");
          },
        },
      },
    });
    const before = (await activityOf(db, userId)).length;
    expect((await send(bug, failing)).status).toBe(500);
    expect(await activityOf(db, userId)).toHaveLength(before);
  });

  test(`${CONTACT_EMAILS.max} a day per user`, async () => {
    for (let i = 0; i < CONTACT_EMAILS.max; i++) await hit(db, CONTACT_EMAILS, userId);
    const over = await send(bug);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

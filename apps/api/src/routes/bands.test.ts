import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, like } from "drizzle-orm";
import { createApp } from "../app";
import { bandMembers, bands, invitations, users } from "../db/schema";
import { createTestDeps } from "../test-deps";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("bands: lineup, musician invitations, band details", () => {
  const { deps, db, sql, auth, mailer } = createTestDeps(databaseUrl);
  const app = createApp({ deps, log: false });

  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const bandSlug = `band-${run}`;
  const otherSlug = `other-${run}`;

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

  function call(path: string, who: string, init: { method?: string; body?: unknown } = {}) {
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        cookie: cookies[who] ?? "",
        origin: "http://localhost:3000",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  const lastToken = () => /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1] ?? "";

  /** A user who is a member of a band with the given role. */
  async function member(
    who: string,
    slug: string,
    role: "leader" | "musician",
    instrument: string,
  ) {
    const { user } = await auth.api.createUser({
      body: { email: email(who), password, name: who },
    });
    let [band] = await db.select().from(bands).where(eq(bands.slug, slug));
    if (!band) {
      [band] = await db
        .insert(bands)
        .values({ name: `${slug} name`, slug })
        .returning();
    }
    await db
      .insert(bandMembers)
      .values({ bandId: band?.id ?? "", userId: user.id, role, instrument });
    cookies[who] = await login(email(who));
  }

  beforeAll(async () => {
    await member("leader", bandSlug, "leader", "Guitar");
    await member("bassist", bandSlug, "musician", "Bass");
    await member("outsider", otherSlug, "leader", "Drums");
  });

  afterAll(async () => {
    await db.delete(bands).where(like(bands.slug, `%${run}%`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  });

  test("the lineup is visible to members only", async () => {
    const res = await call(`/bands/${bandSlug}/members`, "bassist");
    expect(res.status).toBe(200);
    const { members } = (await res.json()) as {
      members: { name: string; role: string; instrument: string }[];
    };
    expect(members.map((m) => [m.name, m.role, m.instrument])).toEqual([
      ["leader", "leader", "Guitar"],
      ["bassist", "musician", "Bass"],
    ]);
    expect((await call(`/bands/${bandSlug}/members`, "outsider")).status).toBe(404);
  });

  test("musicians can't invite, see invitations or edit the band", async () => {
    const invite = await call(`/bands/${bandSlug}/invitations`, "bassist", {
      method: "POST",
      body: { email: email("x"), language: "en" },
    });
    expect(invite.status).toBe(403);
    expect((await call(`/bands/${bandSlug}/invitations`, "bassist")).status).toBe(403);
    const edit = await call(`/bands/${bandSlug}`, "bassist", {
      method: "PATCH",
      body: { genre: "Jazz" },
    });
    expect(edit.status).toBe(403);
  });

  test("the band leader invites a musician; duplicates and existing members are refused", async () => {
    const res = await call(`/bands/${bandSlug}/invitations`, "leader", {
      method: "POST",
      body: { email: email("singer"), language: "en" },
    });
    expect(res.status).toBe(201);
    const mail = mailer.sent.at(-1);
    expect(mail?.subject).toBe(`Join ${bandSlug} name on CoverBand`);
    expect(mail?.text).toContain("leader invites you to join");

    const list = (await (await call(`/bands/${bandSlug}/invitations`, "leader")).json()) as {
      invitations: { email: string; status: string }[];
    };
    expect(list.invitations).toMatchObject([{ email: email("singer"), status: "pending" }]);

    const again = await call(`/bands/${bandSlug}/invitations`, "leader", {
      method: "POST",
      body: { email: email("singer"), language: "en" },
    });
    expect(await errorCode(again)).toBe("already_invited");
    const memberAgain = await call(`/bands/${bandSlug}/invitations`, "leader", {
      method: "POST",
      body: { email: email("bassist"), language: "en" },
    });
    expect(memberAgain.status).toBe(409);
    expect(await errorCode(memberAgain)).toBe("already_member");
  });

  test("a new musician gets an account and joins the band, logged in", async () => {
    const token = lastToken();
    const info = (await (await app.request(`/api/invitations/${token}`)).json()) as {
      role: string;
      bandName: string;
    };
    expect(info).toMatchObject({ role: "musician", bandName: `${bandSlug} name` });

    const res = await app.request(`/api/invitations/${token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        instrument: "Vocals",
        newAccount: { firstName: "Sam", lastName: "Singer", password },
      }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { bandSlug: string }).bandSlug).toBe(bandSlug);
    cookies.singer = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const mine = (await (await call("/bands", "singer")).json()) as {
      bands: { role: string; instrument: string }[];
    };
    expect(mine.bands).toMatchObject([{ role: "musician", instrument: "Vocals" }]);
  });

  test("someone with an account joins after logging in; members can't join twice", async () => {
    // The outsider leads another band and joins this one as a musician.
    await call(`/bands/${bandSlug}/invitations`, "leader", {
      method: "POST",
      body: { email: email("outsider"), language: "fr" },
    });
    const token = lastToken();
    const accept = (who: string) =>
      app.request(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookies[who] ?? "",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ instrument: "Keys" }),
      });
    expect((await accept("nobody")).status).toBe(401);
    expect(await errorCode(await accept("bassist"))).toBe("invitation_wrong_account");
    expect((await accept("outsider")).status).toBe(201);

    const mine = (await (await call("/bands", "outsider")).json()) as { bands: { role: string }[] };
    expect(mine.bands.map((b) => b.role).sort()).toEqual(["leader", "musician"]);

    // A fresh invitation for someone who is already in: refused at acceptance too.
    const [band] = await db.select().from(bands).where(eq(bands.slug, bandSlug));
    await db
      .delete(bandMembers)
      .where(
        and(
          eq(bandMembers.bandId, band?.id ?? ""),
          eq(bandMembers.userId, (await userId("outsider")) ?? ""),
        ),
      );
    await call(`/bands/${bandSlug}/invitations`, "leader", {
      method: "POST",
      body: { email: email("outsider"), language: "fr" },
    });
    const second = lastToken();
    await db.insert(bandMembers).values({
      bandId: band?.id ?? "",
      userId: (await userId("outsider")) ?? "",
      role: "musician",
      instrument: "Keys",
    });
    const res = await app.request(`/api/invitations/${second}/accept`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookies.outsider ?? "",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ instrument: "Keys" }),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("already_member");
  });

  async function userId(who: string) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email(who)));
    return user?.id;
  }

  test("resend and revoke only reach the band's own invitations", async () => {
    await call(`/bands/${bandSlug}/invitations`, "leader", {
      method: "POST",
      body: { email: email("drummer"), language: "en" },
    });
    const [row] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.email, email("drummer")));
    const path = `/invitations/${row?.id}`;
    // The other band's leader can't touch it.
    expect(
      (await call(`/bands/${otherSlug}${path}`, "outsider", { method: "DELETE" })).status,
    ).toBe(404);
    expect(
      (await call(`/bands/${bandSlug}${path}/resend`, "leader", { method: "POST" })).status,
    ).toBe(200);
    expect((await call(`/bands/${bandSlug}${path}`, "leader", { method: "DELETE" })).status).toBe(
      204,
    );
  });

  test("the band leader changes the genre; the name can't change", async () => {
    const res = await call(`/bands/${bandSlug}`, "leader", {
      method: "PATCH",
      body: { genre: "Funk" },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { band: unknown }).band).toEqual({
      name: `${bandSlug} name`,
      slug: bandSlug,
      genre: "Funk",
    });

    // A name in the body is ignored: band names are forever.
    const renamed = await call(`/bands/${bandSlug}`, "leader", {
      method: "PATCH",
      body: { name: "Renamed", genre: null },
    });
    expect(((await renamed.json()) as { band: unknown }).band).toEqual({
      name: `${bandSlug} name`,
      slug: bandSlug,
      genre: null,
    });
    const empty = await call(`/bands/${bandSlug}`, "leader", { method: "PATCH", body: {} });
    expect(empty.status).toBe(400);
  });
});

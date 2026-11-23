// A band with members, logged in, for a module's integration tests (needs the local Postgres).

import { inArray, like } from "drizzle-orm";
import { createApp } from "./app";
import { activity, bandMembers, bands, users } from "./core/db/schema";
import type { AppDeps } from "./deps";
import { createTestDeps } from "./test-deps";

type Role = "leader" | "musician";

/**
 * Two bands: `slug` with `members` (name → role), `otherSlug` led by `outsider`. `call(path, who)`
 * sends a JSON request under /api as that member. `cleanUp()` deletes everything made. `overrides`
 * replaces dependencies (push, storage…).
 */
export function testBand(
  prefix: string,
  databaseUrl: string | undefined,
  overrides: Partial<AppDeps> = {},
) {
  const testDeps = createTestDeps(databaseUrl);
  const { db, sql, auth } = testDeps;
  const deps = { ...testDeps.deps, ...overrides };
  const app = createApp({ deps });
  const run = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${run}@test.localhost`;
  const password = "correct horse battery";
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const slug = `${prefix}-${run}`;
  const otherSlug = `${prefix}-other-${run}`;
  const band = { id: "", otherId: "" };

  function call(
    path: string,
    who: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const isForm = init.body instanceof FormData;
    return app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(isForm ? {} : { "content-type": "application/json" }),
        cookie: cookies[who] ?? "",
        origin: "http://localhost:3000",
        ...init.headers,
      },
      body:
        init.body === undefined
          ? undefined
          : isForm
            ? (init.body as FormData)
            : JSON.stringify(init.body),
    });
  }

  async function setUp(members: Record<string, Role>, outsider = "zoe") {
    const [main, other] = await db
      .insert(bands)
      .values([
        { name: `${prefix} ${run}`, slug },
        { name: `${prefix} other ${run}`, slug: otherSlug },
      ])
      .returning();
    band.id = main?.id ?? "";
    band.otherId = other?.id ?? "";
    const all: [string, string, Role][] = [
      ...Object.entries(members).map(([who, role]): [string, string, Role] => [who, band.id, role]),
      [outsider, band.otherId, "leader"],
    ];
    for (const [who, bandId, role] of all) {
      const { user } = await auth.api.createUser({
        body: { email: email(who), password, name: `${who} name` },
      });
      ids[who] = user.id;
      await db.insert(bandMembers).values({ bandId, userId: user.id, role });
      const res = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: email(who), password }),
      });
      cookies[who] = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    }
  }

  async function cleanUp() {
    await db.delete(activity).where(inArray(activity.actorId, Object.values(ids)));
    await db.delete(bands).where(like(bands.slug, `${prefix}-%${run}`));
    await db.delete(users).where(like(users.email, `%-${run}@test.localhost`));
    await sql.end();
  }

  const errorOf = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error.code;

  return { ...testDeps, deps, app, call, setUp, cleanUp, errorOf, ids, slug, otherSlug, band };
}

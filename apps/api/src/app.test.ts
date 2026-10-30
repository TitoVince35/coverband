import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { createApiClient } from "./client";
import { IMMUTABLE } from "./core/http/static-cache";
import { createTestDeps } from "./test-deps";

const { deps } = createTestDeps();

describe("API", () => {
  const app = createApp({ deps });

  test("GET /api/health returns ok, with the version and build", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "0.0.0-test", build: "test" });
  });

  test("unknown API routes return a JSON 404", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });

  test("typed client calls the REST routes", async () => {
    const client = createApiClient("http://localhost", {
      fetch: (input: string | URL | Request, init?: RequestInit) => app.request(input, init),
    });
    const res = await client.health.$get();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("web app serving", () => {
  let dist: string;

  beforeAll(async () => {
    dist = await mkdtemp(join(tmpdir(), "coverband-dist-"));
    await writeFile(join(dist, "index.html"), "<!doctype html><title>CoverBand</title>");
    await writeFile(join(dist, "app.js"), "console.log('app')");
    await mkdir(join(dist, "assets"));
    await writeFile(join(dist, "assets", "index-AbC123.js"), "console.log('hashed')");
  });

  afterAll(() => rm(dist, { recursive: true, force: true }));

  test("serves static files", async () => {
    const res = await createApp({ deps, webDistDir: dist }).request("/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("console.log");
  });

  test("falls back to index.html for client-side routes", async () => {
    const res = await createApp({ deps, webDistDir: dist }).request("/b/my-band/setlists");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>CoverBand</title>");
  });

  test("hashed assets are cached for good, everything else is checked on every load (#164)", async () => {
    const app = createApp({ deps, webDistDir: dist });
    const header = async (path: string) => (await app.request(path)).headers.get("cache-control");
    expect(await header("/assets/index-AbC123.js")).toBe(IMMUTABLE);
    for (const path of ["/", "/app.js", "/b/my-band"]) {
      expect(await header(path)).toBe("no-cache");
    }
    // An old build's file: a 404, not the app shell cached for a year.
    const missing = await app.request("/assets/index-Old999.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-cache");
    expect(await header("/api/health")).toBeNull();
  });

  test("keeps JSON 404s under /api", async () => {
    const res = await createApp({ deps, webDistDir: dist }).request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });
});

describe("admin app serving (#246)", () => {
  let web: string;
  let admin: string;
  const adminDeps = {
    ...deps,
    adminUrl: "https://admin.localhost:3000",
    access: {
      code: "beta",
      secret: "s".repeat(32),
      clientIpHeader: "x-forwarded-for",
      https: false,
    },
  };
  const onAdmin = { headers: { host: "admin.localhost:3000" } };

  beforeAll(async () => {
    web = await mkdtemp(join(tmpdir(), "coverband-web-"));
    admin = await mkdtemp(join(tmpdir(), "coverband-admin-"));
    await writeFile(join(web, "index.html"), "<title>Web</title>");
    await writeFile(join(admin, "index.html"), "<title>Admin</title>");
  });

  afterAll(async () => {
    await rm(web, { recursive: true, force: true });
    await rm(admin, { recursive: true, force: true });
  });

  const app = () => createApp({ deps: adminDeps, webDistDir: web, adminDistDir: admin });

  test("the admin host gets the admin app, any other host the web app", async () => {
    expect(await (await app().request("/users", onAdmin)).text()).toContain("Admin");
    expect(await (await app().request("/users")).text()).toContain("Web");
    // The port doesn't matter, nor the case.
    const other = { headers: { host: "ADMIN.localhost:5174" } };
    expect(await (await app().request("/", other)).text()).toContain("Admin");
  });

  test("the admin host only reaches the API routes the admin app needs", async () => {
    expect((await app().request("/api/bands", onAdmin)).status).toBe(404);
    expect((await app().request("/api/me", onAdmin)).status).toBe(404);
    expect((await app().request("/api/health", onAdmin)).status).toBe(200);
    // Past the beta access code: the admin routes ask for an admin session.
    expect((await app().request("/api/admin/stats", onAdmin)).status).toBe(401);
  });

  test("the main host keeps the beta access code", async () => {
    const res = await app().request("/api/admin/stats");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "access_required" } });
  });

  test("without an admin URL, every host gets the web app", async () => {
    const plain = createApp({ deps, webDistDir: web, adminDistDir: admin });
    expect(await (await plain.request("/", onAdmin)).text()).toContain("Web");
  });
});

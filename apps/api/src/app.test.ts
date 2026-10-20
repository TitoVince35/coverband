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

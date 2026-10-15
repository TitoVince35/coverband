import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { createApiClient } from "./client";
import { createTestDeps } from "./test-deps";

const { deps } = createTestDeps();

describe("API", () => {
  const app = createApp({ deps, log: false });

  test("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
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
  });

  afterAll(() => rm(dist, { recursive: true, force: true }));

  test("serves static files", async () => {
    const res = await createApp({ deps, webDistDir: dist, log: false }).request("/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("console.log");
  });

  test("falls back to index.html for client-side routes", async () => {
    const res = await createApp({ deps, webDistDir: dist, log: false }).request(
      "/b/my-band/setlists",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>CoverBand</title>");
  });

  test("keeps JSON 404s under /api", async () => {
    const res = await createApp({ deps, webDistDir: dist, log: false }).request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });
});

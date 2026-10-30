import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { adminHost, adminHostApi, onAdminHost } from "./admin-host";

describe("admin host (#246)", () => {
  const host = adminHost("https://Admin-Beta.coverband.fr");
  const app = new Hono()
    .use("/api/*", adminHostApi(host))
    .get("/api/*", (c) => c.text("ok"))
    .get("/", (c) => c.text(onAdminHost(c, host) ? "admin" : "web"));
  const get = (path: string, hostHeader: string) =>
    app.request(path, { headers: { host: hostHeader } });

  test("recognised by its hostname, whatever the case or port", async () => {
    expect(await (await get("/", "admin-beta.coverband.fr")).text()).toBe("admin");
    expect(await (await get("/", "ADMIN-BETA.coverband.fr:443")).text()).toBe("admin");
    expect(await (await get("/", "beta.coverband.fr")).text()).toBe("web");
  });

  test("lets through only health, auth and admin API paths", async () => {
    for (const path of ["/api/health", "/api/auth/get-session", "/api/admin", "/api/admin/stats"]) {
      expect((await get(path, "admin-beta.coverband.fr")).status).toBe(200);
    }
    for (const path of ["/api/bands", "/api/me", "/api/administrators", "/api/healthz"]) {
      expect((await get(path, "admin-beta.coverband.fr")).status).toBe(404);
    }
    // Other hosts are left alone.
    expect((await get("/api/bands", "beta.coverband.fr")).status).toBe(200);
  });

  test("no admin URL: no admin host", async () => {
    const none = new Hono().get("/", (c) => c.text(String(onAdminHost(c, adminHost(undefined)))));
    expect(await (await none.request("/", { headers: { host: "admin.localhost" } })).text()).toBe(
      "false",
    );
  });
});

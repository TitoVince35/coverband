import { describe, expect, test } from "bun:test";
import { createApp } from "../../app";
import { createTestDeps } from "../../test-deps";
import { MAX_BODY_SIZE, THEME_SCRIPT_HASH } from "./security";

const INDEX_HTML = new URL("../../../../web/index.html", import.meta.url);

function cspHash(script: string) {
  return `'sha256-${new Bun.CryptoHasher("sha256").update(script).digest("base64")}'`;
}

describe("security headers", () => {
  const { deps } = createTestDeps();

  test("the CSP allows the inline theme script of index.html", async () => {
    const html = await Bun.file(INDEX_HTML).text();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
    expect(scripts).toHaveLength(1);
    // On failure, set THEME_SCRIPT_HASH (middleware/security.ts) to the received value.
    expect(THEME_SCRIPT_HASH).toBe(cspHash(scripts[0] ?? ""));
  });

  test("are set on API responses", async () => {
    const res = await createApp({ deps }).request("/api/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' ${THEME_SCRIPT_HASH}`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("are set on errors and Better Auth responses", async () => {
    const app = createApp({ deps });
    for (const path of ["/api/nope", "/api/auth/ok"]) {
      const res = await app.request(path);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });

  test("HSTS only over HTTPS", async () => {
    const http = await createApp({ deps }).request("/api/health");
    expect(http.headers.get("strict-transport-security")).toBeNull();

    const https = await createApp({
      deps: { ...deps, appUrl: "https://coverband.example" },
    }).request("/api/health");
    expect(https.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});

describe("request guards on /api", () => {
  const { deps } = createTestDeps();
  const app = createApp({
    deps: { ...deps, trustedOrigins: ["http://192.168.1.20:5173"] },
  });

  function post(headers: Record<string, string>, body = "a=1") {
    return app.request("/api/nope", { method: "POST", headers, body });
  }

  const form = { "content-type": "application/x-www-form-urlencoded" };

  test("refuse form-style requests from other sites", async () => {
    for (const headers of [
      { ...form, origin: "https://evil.example" },
      { ...form, "sec-fetch-site": "cross-site" },
      { "content-type": "text/plain", origin: "https://evil.example" },
      form,
    ]) {
      const res = await post(headers);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: { code: "forbidden", message: "Request refused" },
      });
    }
  });

  test("allow form-style requests from the app and trusted origins", async () => {
    for (const headers of [
      { ...form, origin: "http://localhost:3000" },
      { ...form, origin: "http://192.168.1.20:5173" },
      { ...form, "sec-fetch-site": "same-origin" },
    ]) {
      expect((await post(headers)).status).toBe(404);
    }
  });

  test("let JSON requests through (the browser blocks them cross-site without CORS)", async () => {
    const res = await post({ "content-type": "application/json" }, "{}");
    expect(res.status).toBe(404);
  });

  test("refuse bodies over the limit, Better Auth included", async () => {
    const body = JSON.stringify({ email: "x".repeat(MAX_BODY_SIZE) });
    for (const path of ["/api/nope", "/api/auth/sign-in/email"]) {
      const res = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({
        error: { code: "bad_request", message: "Request body too large" },
      });
    }
  });

  test("no CORS headers", async () => {
    const res = await app.request("/api/health", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

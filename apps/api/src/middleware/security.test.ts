import { describe, expect, test } from "bun:test";
import { createApp } from "../app";
import { createTestDeps } from "../test-deps";
import { THEME_SCRIPT_HASH } from "./security";

const INDEX_HTML = new URL("../../../web/index.html", import.meta.url);

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
    const res = await createApp({ deps, log: false }).request("/api/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(res.headers.get("x-powered-by")).toBeNull();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' ${THEME_SCRIPT_HASH}`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("are set on errors and Better Auth responses", async () => {
    const app = createApp({ deps, log: false });
    for (const path of ["/api/nope", "/api/auth/ok"]) {
      const res = await app.request(path);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    }
  });

  test("HSTS only over HTTPS", async () => {
    const http = await createApp({ deps, log: false }).request("/api/health");
    expect(http.headers.get("strict-transport-security")).toBeNull();

    const https = await createApp({
      deps: { ...deps, appUrl: "https://coverband.example" },
      log: false,
    }).request("/api/health");
    expect(https.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});

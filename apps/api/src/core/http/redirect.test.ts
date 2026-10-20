import { describe, expect, test } from "bun:test";
import { createApp } from "../../app";
import { createTestDeps } from "../../test-deps";

describe("redirected hosts", () => {
  const { deps } = createTestDeps();
  const app = createApp({
    deps: {
      ...deps,
      appUrl: "https://beta.coverband.example",
      redirectHosts: ["coverband.example"],
    },
  });

  test("a listed host is sent to the app URL, path and query kept", async () => {
    const res = await app.request("https://coverband.example/b/band/songs?archived=true");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://beta.coverband.example/b/band/songs?archived=true",
    );
  });

  test("API requests too, whatever the case of the host", async () => {
    const res = await app.request("/api/health", { headers: { host: "Coverband.Example" } });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://beta.coverband.example/api/health");
  });

  test("the app URL and other hosts are served", async () => {
    expect((await app.request("https://beta.coverband.example/api/health")).status).toBe(200);
    expect((await app.request("http://localhost/api/health")).status).toBe(200);
  });
});

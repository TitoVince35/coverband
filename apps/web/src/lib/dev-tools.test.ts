import { describe, expect, test } from "bun:test";
import { drizzleStudioUrl, garageUrl, mailpitUrl } from "./dev-tools";

describe("mailpitUrl", () => {
  test("points to Mailpit on the host serving the app", () => {
    expect(mailpitUrl("localhost")).toBe("http://localhost:8025");
    expect(mailpitUrl("192.168.1.20")).toBe("http://192.168.1.20:8025");
  });
});

describe("garageUrl", () => {
  test("points to Garage's web UI on the host serving the app", () => {
    expect(garageUrl("localhost")).toBe("http://localhost:3909");
    expect(garageUrl("192.168.1.20")).toBe("http://192.168.1.20:3909");
  });
});

describe("drizzleStudioUrl", () => {
  test("only on the dev machine itself", () => {
    expect(drizzleStudioUrl("localhost")).toBe("https://local.drizzle.studio");
    expect(drizzleStudioUrl("127.0.0.1")).toBe("https://local.drizzle.studio");
    expect(drizzleStudioUrl("192.168.1.20")).toBeNull();
  });
});

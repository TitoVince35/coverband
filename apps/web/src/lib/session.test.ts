import { describe, expect, test } from "bun:test";
import { appSession } from "./session";

describe("appSession", () => {
  test("drops the session's token, IP and browser: the app keeps it on the device (#165)", () => {
    const kept = appSession({
      user: { id: "u1", name: "Lea" },
      session: {
        id: "s1",
        userId: "u1",
        expiresAt: new Date("2026-10-27T00:00:00Z"),
        token: "secret-token",
        ipAddress: "10.0.0.1",
        userAgent: "Mozilla/5.0",
      },
    } as unknown as Parameters<typeof appSession>[0]);
    expect(kept).toEqual({
      user: { id: "u1", name: "Lea" },
      session: { id: "s1", userId: "u1", expiresAt: new Date("2026-10-27T00:00:00Z") },
    } as unknown as typeof kept);
    expect(JSON.stringify(kept)).not.toContain("secret-token");
  });
});

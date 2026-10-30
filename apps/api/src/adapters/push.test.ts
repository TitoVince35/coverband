import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { isPushService, PUSH_SERVICE_HOSTS, vapidKeys } from "./push";

describe("push adapter", () => {
  test("VAPID keys from a P-256 key in PEM: raw private key, uncompressed public point", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const keys = vapidKeys(pem, "https://app.example");
    expect(Buffer.from(keys.privateKey, "base64url")).toHaveLength(32);
    const point = Buffer.from(keys.publicKey, "base64url");
    expect(point).toHaveLength(65);
    expect(point[0]).toBe(4);
    expect(keys.subject).toBe("https://app.example");
    // The SEC1 form (`BEGIN EC PRIVATE KEY`) too.
    const sec1 = privateKey.export({ type: "sec1", format: "pem" }).toString();
    expect(vapidKeys(sec1, "x").publicKey).toBe(keys.publicKey);
  });

  test("another curve is refused", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => vapidKeys(pem, "x")).toThrow("P-256");
  });

  test("only the push services, over HTTPS", () => {
    const ok = (endpoint: string) => isPushService(endpoint, PUSH_SERVICE_HOSTS);
    expect(ok("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(ok("https://web.push.apple.com/QK1")).toBe(true);
    expect(ok("https://wns2-par02p.notify.windows.com/w/?token=1")).toBe(true);
    expect(ok("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(ok("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(ok("https://fcm.googleapis.com.evil.example/")).toBe(false);
    expect(ok("https://localhost:3104/push")).toBe(false);
    expect(isPushService("https://localhost:3104/push", ["localhost"])).toBe(true);
    expect(ok("not a url")).toBe(false);
  });
});

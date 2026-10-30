import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CERT_DIR } from "./tls";

/**
 * This machine's VAPID private key for push notifications (#261), made once in `.certs/`
 * (git-ignored) and kept: a new one would invalidate every device's subscription. Production has
 * its own (OpenTofu).
 */
export function localVapidKey(): string {
  const file = join(CERT_DIR, "vapid.pem");
  if (existsSync(file)) return readFileSync(file, "utf8");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(file, pem, { mode: 0o600 });
  return pem;
}

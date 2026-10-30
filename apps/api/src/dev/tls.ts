/**
 * Local HTTPS for the development scripts (#163): service workers, installing the app and the
 * screen wake lock need a secure context, and on a phone that means HTTPS. Certificates come from
 * mkcert, whose local certificate authority the computer (`mkcert -install`) and the phone
 * (its root certificate, see `rootCertificate`) trust. Without mkcert: plain http and a warning.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Git-ignored folder holding the certificate, its key, and what it was issued for. */
export const CERT_DIR = fileURLToPath(new URL("../../../../.certs", import.meta.url));

export type LocalTls = { certFile: string; keyFile: string };

/** Names every certificate covers (the admin app's host too, #246); the LAN IP is added in the LAN modes. */
export const LOCAL_NAMES = ["localhost", "admin.localhost", "127.0.0.1", "::1"];

/** What a certificate was issued for: its names, and the authority that signed it. */
export type Issued = { names: string[]; authority: string };

/**
 * Whether the certificate still fits: every name needed (a new LAN IP isn't), signed by the
 * current authority (another `mkcert -install` makes a new one, which browsers trust instead).
 */
export function fits(issued: Issued | undefined, needed: Issued) {
  return (
    issued !== undefined &&
    issued.authority === needed.authority &&
    needed.names.every((name) => issued.names.includes(name))
  );
}

function warn(lines: string[]) {
  console.warn(`\n⚠ ${lines.join("\n  ")}\n`);
}

function mkcert(args: string[]) {
  const result = Bun.spawnSync(["mkcert", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`mkcert ${args.join(" ")} failed:\n${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

/** mkcert's root certificate, which phones install to trust our certificates. */
export function rootCertificate(): string | undefined {
  if (!Bun.which("mkcert")) return undefined;
  const file = join(mkcert(["-CAROOT"]), "rootCA.pem");
  return existsSync(file) ? file : undefined;
}

/**
 * A certificate for localhost plus `extraNames` (the LAN IP), issued again when a name is
 * missing (the LAN IP changed). Undefined, with a warning, when mkcert can't provide one.
 */
export function localTls(extraNames: string[] = []): LocalTls | undefined {
  if (!Bun.which("mkcert")) {
    warn([
      "mkcert is not installed: the app is served over plain http.",
      "Service workers, installing the app and the screen wake lock need HTTPS on a phone.",
      "Install it once: sudo apt install mkcert (or brew install mkcert), then mkcert -install.",
    ]);
    return undefined;
  }
  const root = rootCertificate();
  if (!root) {
    warn([
      "mkcert has no certificate authority yet: the app is served over plain http.",
      "Create and trust it once with: mkcert -install",
    ]);
    return undefined;
  }

  const tls = { certFile: join(CERT_DIR, "local.pem"), keyFile: join(CERT_DIR, "local-key.pem") };
  const issuedFile = join(CERT_DIR, "issued.json");
  const needed: Issued = {
    names: [...LOCAL_NAMES, ...extraNames],
    authority: new Bun.CryptoHasher("sha256").update(readFileSync(root)).digest("hex"),
  };
  const issued: Issued | undefined = existsSync(issuedFile)
    ? JSON.parse(readFileSync(issuedFile, "utf8"))
    : undefined;
  if (!existsSync(tls.certFile) || !existsSync(tls.keyFile) || !fits(issued, needed)) {
    mkdirSync(CERT_DIR, { recursive: true });
    mkcert(["-cert-file", tls.certFile, "-key-file", tls.keyFile, ...needed.names]);
    writeFileSync(issuedFile, JSON.stringify(needed));
    console.log(`Local certificate issued for ${needed.names.join(", ")}`);
  }
  return tls;
}

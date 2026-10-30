import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The fake push service's self-signed certificate for `localhost` (fake-push.ts), made once with
 * openssl in the system's temporary folder: the API trusts it (NODE_EXTRA_CA_CERTS), nothing else.
 */
export function pushCertificate() {
  const dir = join(tmpdir(), "coverband-e2e-push");
  const certFile = join(dir, "cert.pem");
  const keyFile = join(dir, "key.pem");
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    mkdirSync(dir, { recursive: true });
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-keyout",
        keyFile,
        "-out",
        certFile,
        "-days",
        "3650",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
      ],
      { stdio: "ignore" },
    );
  }
  return { certFile, keyFile };
}

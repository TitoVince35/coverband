import { describe, expect, test } from "bun:test";
import { loadDatabaseEnv, loadEnv, loadLogEnv, logConfig, s3Config } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  MAIL_FROM: "Coverband <noreply@coverband.localhost>",
  S3_ENDPOINT: "http://localhost:3900",
  S3_REGION: "garage",
  S3_BUCKET: "coverband",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("loadEnv", () => {
  test("object storage: every S3 variable is required", () => {
    expect(s3Config(loadEnv(valid))).toEqual({
      endpoint: "http://localhost:3900",
      region: "garage",
      bucket: "coverband",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(() => loadEnv({ ...valid, S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
    expect(() => loadEnv({ ...valid, S3_ENDPOINT: "localhost:3900" })).toThrow(/S3_ENDPOINT/);
  });

  test("logs: info and JSON by default, validated", () => {
    expect(logConfig(loadEnv(valid))).toEqual({ level: "info", format: "json" });
    expect(logConfig(loadLogEnv({ LOG_LEVEL: "debug", LOG_FORMAT: "pretty" }))).toEqual({
      level: "debug",
      format: "pretty",
    });
    expect(() => loadEnv({ ...valid, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
    expect(() => loadEnv({ ...valid, LOG_FORMAT: "text" })).toThrow(/LOG_FORMAT/);
  });

  test("local TLS: both files or neither", () => {
    expect(loadEnv(valid).TLS_CERT_FILE).toBeUndefined();
    const tls = { TLS_CERT_FILE: ".certs/local.pem", TLS_KEY_FILE: ".certs/local-key.pem" };
    expect(loadEnv({ ...valid, ...tls }).TLS_KEY_FILE).toBe(".certs/local-key.pem");
    expect(() => loadEnv({ ...valid, TLS_CERT_FILE: tls.TLS_CERT_FILE })).toThrow(/TLS_KEY_FILE/);
  });

  test("cron secret: optional, at least 32 characters", () => {
    expect(loadEnv(valid).CRON_SECRET).toBeUndefined();
    expect(loadEnv({ ...valid, CRON_SECRET: "c".repeat(32) }).CRON_SECRET).toBe("c".repeat(32));
    expect(() => loadEnv({ ...valid, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
  });

  test("accepts a complete environment", () => {
    const env = loadEnv(valid);
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.PORT).toBe(3000);
  });

  test("rejects a missing or non-postgres URL", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...valid, DATABASE_URL: "https://example.com" })).toThrow(
      /DATABASE_URL/,
    );
  });

  test("requires a long auth secret", () => {
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  test("default admin: both variables or neither, and a policy-compliant password", () => {
    const admin = { ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "long enough password" };
    expect(loadEnv({ ...valid, ...admin }).ADMIN_EMAIL).toBe("admin@example.com");
    expect(() => loadEnv({ ...valid, ADMIN_EMAIL: admin.ADMIN_EMAIL })).toThrow(/ADMIN_PASSWORD/);
    expect(() => loadEnv({ ...valid, ...admin, ADMIN_PASSWORD: "short" })).toThrow(
      /ADMIN_PASSWORD/,
    );
  });

  test("SMTP: port as a number, implicit TLS off unless asked", () => {
    const env = loadEnv(valid);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(false);
    expect(loadEnv({ ...valid, SMTP_PORT: "465", SMTP_SECURE: "true" }).SMTP_SECURE).toBe(true);
    expect(() => loadEnv({ ...valid, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
  });
});

describe("TRUSTED_ORIGINS", () => {
  test("a comma-separated list of URLs, empty by default", () => {
    expect(loadEnv(valid).TRUSTED_ORIGINS).toEqual([]);
    expect(
      loadEnv({ ...valid, TRUSTED_ORIGINS: "http://localhost:5173, http://192.168.1.20:5173," })
        .TRUSTED_ORIGINS,
    ).toEqual(["http://localhost:5173", "http://192.168.1.20:5173"]);
    expect(() => loadEnv({ ...valid, TRUSTED_ORIGINS: "localhost" })).toThrow(/TRUSTED_ORIGINS/);
  });
});

describe("REDIRECT_HOSTS", () => {
  test("a comma-separated list of hostnames, lowercased, empty by default", () => {
    expect(loadEnv(valid).REDIRECT_HOSTS).toEqual([]);
    expect(
      loadEnv({ ...valid, REDIRECT_HOSTS: "Coverband.fr, www.coverband.fr," }).REDIRECT_HOSTS,
    ).toEqual(["coverband.fr", "www.coverband.fr"]);
    expect(() => loadEnv({ ...valid, REDIRECT_HOSTS: "https://coverband.fr" })).toThrow(
      /REDIRECT_HOSTS/,
    );
  });
});

describe("BUILD_SHA", () => {
  test("the commit of the image, dev by default", () => {
    expect(loadEnv(valid).BUILD_SHA).toBe("dev");
    expect(loadEnv({ ...valid, BUILD_SHA: "0012ca8" }).BUILD_SHA).toBe("0012ca8");
  });
});

describe("CLIENT_IP_HEADER", () => {
  test("a header name, lowercased, x-forwarded-for by default", () => {
    expect(loadEnv(valid).CLIENT_IP_HEADER).toBe("x-forwarded-for");
    expect(loadEnv({ ...valid, CLIENT_IP_HEADER: "X-Real-IP" }).CLIENT_IP_HEADER).toBe("x-real-ip");
    expect(() => loadEnv({ ...valid, CLIENT_IP_HEADER: "x real ip" })).toThrow(/CLIENT_IP_HEADER/);
  });
});

describe("loadDatabaseEnv", () => {
  test("only needs the database URL", () => {
    expect(loadDatabaseEnv({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL).toBe(
      valid.DATABASE_URL,
    );
  });
});
